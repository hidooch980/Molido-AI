import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';
import type { PaymentGateway } from './payment.types';
import { ZarinpalGateway } from './zarinpal.gateway';

type OrderRow = {
  id: string;
  orderNo: string;
  total: string;
  paymentStatus: string;
  paymentRef: string | null;
  receiverPhone: string | null;
};

/**
 * پرداختِ سفارشِ اینترنتی.
 *
 * ⚠️ این سرویس **تنها جایی** است که وضعیتِ پرداخت را عوض می‌کند.
 *
 *    اگر مسیرِ دیگری هم می‌توانست `paymentStatus` را «PAID» کند، همان
 *    مسیر می‌شد راهِ دور زدنِ درگاه.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly zarinpal: ZarinpalGateway,
  ) {}

  /** فعلاً یک درگاه؛ افزودنِ بعدی یعنی یک شرط اینجا. */
  private gateway(): PaymentGateway {
    return this.zarinpal;
  }

  isConfigured(): boolean {
    return this.gateway().isConfigured();
  }

  /**
   * ⚠️ `customerId` بخشی از شرط است، نه بررسیِ بعدی.
   *
   *    اگر جدا سنجیده می‌شد، یک مسیر که فراموشش می‌کرد کافی بود تا
   *    هر مشتری بتواند سفارشِ دیگری را پرداخت‌شده کند — یا بدتر،
   *    وضعیتِ پرداختش را ببیند.
   *
   *    نبودنِ سفارش و نداشتنِ دسترسی هر دو «یافت نشد» می‌دهند: پیامِ
   *    متفاوت به مهاجم می‌گوید این شناسه وجود دارد.
   */
  private async loadOrder(
    companyId: string,
    orderId: string,
    customerId: string,
  ) {
    const rows = await this.db.query<OrderRow>(
      `SELECT id, "orderNo", total, "paymentStatus", "paymentRef", "receiverPhone"
         FROM "OnlineOrder"
        WHERE id = $1 AND "companyId" = $2 AND "customerId" = $3`,
      [orderId, companyId, customerId],
    );
    if (!rows[0]) throw new NotFoundException('سفارش یافت نشد');
    return rows[0];
  }

  /**
   * آغازِ پرداخت — نشانیِ درگاه را برمی‌گرداند.
   *
   * ⚠️ سفارشِ پرداخت‌شده دوباره به درگاه نمی‌رود.
   *
   *    بدونِ این، مشتری می‌توانست با دکمهٔ back دو بار پرداخت کند و
   *    بازگرداندنِ پولِ اضافه کارِ دستی می‌شد.
   */
  async start(companyId: string, orderId: string, customerId: string) {
    const order = await this.loadOrder(companyId, orderId, customerId);

    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('این سفارش قبلاً پرداخت شده است');
    }

    const gateway = this.gateway();
    if (!gateway.isConfigured()) {
      throw new BadRequestException(
        'درگاه پرداخت پیکربندی نشده است؛ ZARINPAL_MERCHANT_ID را تنظیم کنید',
      );
    }

    const siteUrl = (this.config.get<string>('SITE_URL') ?? '').replace(/\/+$/, '');
    if (!siteUrl) {
      // ⚠️ بدونِ نشانیِ مطلق، درگاه نمی‌داند کاربر را کجا برگرداند و
      //    پرداخت در هوا می‌ماند: پول کم می‌شود و سفارش «در انتظار».
      throw new BadRequestException('SITE_URL تنظیم نشده است');
    }

    const result = await gateway.start({
      amount: Number(order.total),
      orderNo: order.orderNo,
      callbackUrl: `${siteUrl}/shop/payment/callback?orderId=${order.id}`,
      mobile: order.receiverPhone,
    });

    if (!result.ok || !result.reference || !result.redirectUrl) {
      throw new BadRequestException(result.error ?? 'آغاز پرداخت ناموفق بود');
    }

    // ⚠️ شناسه **پیش از** فرستادنِ کاربر ذخیره می‌شود.
    //
    //    اگر بعد ذخیره می‌شد و درست همان لحظه چیزی می‌شکست، کاربر
    //    پرداخت می‌کرد و ما هیچ راهی برای تطبیقش نداشتیم.
    await this.db.query(
      `UPDATE "OnlineOrder"
          SET "paymentRef" = $1, "paymentStatus" = 'PENDING'
        WHERE id = $2 AND "companyId" = $3`,
      [`${gateway.name}:${result.reference}`, order.id, companyId],
    );

    return { redirectUrl: result.redirectUrl, orderNo: order.orderNo };
  }

  /**
   * تأیید پس از بازگشت از درگاه.
   *
   * ⚠️ سه بررسیِ جدا، و هر سه لازم‌اند.
   */
  async verify(companyId: string, orderId: string, customerId: string) {
    const order = await this.loadOrder(companyId, orderId, customerId);

    // ۱) پرداخت‌شده را دوباره تأیید نمی‌کنیم.  بارگذاریِ دوبارهٔ صفحهٔ
    //    بازگشت نباید سند یا رویدادِ تکراری بسازد.
    if (order.paymentStatus === 'PAID') {
      return { ok: true, alreadyPaid: true, orderNo: order.orderNo };
    }

    if (!order.paymentRef) {
      throw new BadRequestException('برای این سفارش پرداختی آغاز نشده است');
    }

    const [gatewayName, reference] = order.paymentRef.split(':');
    const gateway = this.gateway();

    // ۲) نامِ درگاه باید بخورد.  اگر روزی درگاه عوض شود، شناسهٔ قدیمی
    //    نباید با درگاهِ تازه تأیید شود.
    if (gatewayName !== gateway.name || !reference) {
      throw new BadRequestException('شناسهٔ پرداخت با درگاه فعلی نمی‌خواند');
    }

    const expected = Number(order.total);
    const result = await gateway.verify(reference, expected);

    if (!result.ok) {
      await this.db.query(
        `UPDATE "OnlineOrder" SET "paymentStatus" = 'FAILED'
          WHERE id = $1 AND "companyId" = $2`,
        [order.id, companyId],
      );
      throw new BadRequestException(result.error ?? 'پرداخت تأیید نشد');
    }

    // ۳) ⚠️ مهم‌ترین بررسی: مبلغ.
    //
    //    درگاه فقط می‌گوید «تراکنش موفق بود».  اگر مبلغ را نسنجیم،
    //    مهاجم می‌تواند سفارشِ ده‌میلیونی را با پرداختِ هزارتومانی
    //    تأیید کند — کدِ پیگیری معتبر است و ما فرض می‌کنیم درست
    //    پرداخت شده.
    if (typeof result.paidAmount === 'number' && result.paidAmount < expected) {
      await this.db.query(
        `UPDATE "OnlineOrder" SET "paymentStatus" = 'FAILED'
          WHERE id = $1 AND "companyId" = $2`,
        [order.id, companyId],
      );
      throw new BadRequestException('مبلغ پرداختی با مبلغ سفارش نمی‌خواند');
    }

    await this.db.query(
      `UPDATE "OnlineOrder"
          SET "paymentStatus" = 'PAID',
              "paymentRef" = $1
        WHERE id = $2 AND "companyId" = $3`,
      [`${gateway.name}:${reference}:${result.trackingCode ?? ''}`, order.id, companyId],
    );

    return {
      ok: true,
      orderNo: order.orderNo,
      trackingCode: result.trackingCode ?? null,
    };
  }
}
