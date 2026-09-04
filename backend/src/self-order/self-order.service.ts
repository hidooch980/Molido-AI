import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { runInTenant, runWithTrackCode } from '../database/tenant-context';
import { RestaurantService } from '../restaurant/restaurant.service';
import { ZarinpalGateway } from '../payment/zarinpal.gateway';
import { OrderTypeDto } from '../restaurant/dto/restaurant.dto';

type TableRow = {
  id: string;
  companyId: string;
  tableNo: string;
  areaId: string | null;
  status: string;
};

type Settings = {
  menuEnabled: boolean;
  orderEnabled: boolean;
  requireApproval: boolean;
  requirePrepay: boolean;
  servicePercent: string;
  taxPercent: string;
  maxOrderAmount: string;
  welcomeText: string | null;
};

/**
 * منوی دیجیتال — مشتری QR روی میز را اسکن می‌کند.
 *
 * ⚠️ این تنها مسیرِ رستوران است که **بدونِ توکن** صدا زده می‌شود.
 *
 *    یعنی هر فرضی که در بقیهٔ ماژول درست است، اینجا باید دوباره
 *    ثابت شود:
 *
 *      • قیمت از پایگاه‌داده، نه از درخواست.  (`trustClient: false`)
 *      • شرکت از توکنِ میز، نه از پارامترِ درخواست.
 *      • هر چیزی که مشتری نباید ببیند، در پاسخ نباشد — بهای تمام‌شده،
 *        شناسهٔ شرکت، نامِ گارسون.
 *
 * ⚠️ و «عمومی» یعنی **هرکسی**، نه «مشتریِ ما».
 *
 *    تنها چیزی که توکنِ میز اثبات می‌کند این است که کسی زمانی کنارِ
 *    آن میز بوده.  پس هر گلوگاهی که خسارت را مهار می‌کند — تأییدِ
 *    گارسون، سقفِ مبلغ، پرداختِ پیش از آشپزخانه — به‌جای اعتماد
 *    گذاشته شده.
 */
@Injectable()
export class SelfOrderService {
  constructor(
    private readonly db: DatabaseService,
    private readonly restaurant: RestaurantService,
    private readonly gateway: ZarinpalGateway,
  ) {}

  /**
   * میز را از روی توکن پیدا می‌کند.
   *
   * ⚠️ اینجا هنوز شرکت را نمی‌دانیم، پس از روزنهٔ عمومی می‌رویم —
   *    سیاستی که فقط سطرِ همین توکن را باز می‌کند.
   */
  private async tableByToken(token: string): Promise<TableRow> {
    const clean = String(token ?? '').trim();

    // ⚠️ ریخت پیش از پرس‌وجو سنجیده می‌شود.
    //
    //    توکن سی‌ودو نویسهٔ هگز است.  ورودیِ بدریخت قطعاً پیدا نمی‌شود؛
    //    فرستادنش به پایگاه‌داده فقط مسیرِ ارزانی برای کوبیدنِ سرور
    //    باز می‌کند.
    if (!/^[0-9a-f]{32}$/i.test(clean)) {
      throw new NotFoundException('این کد معتبر نیست');
    }

    const rows = await runWithTrackCode(clean, () =>
      this.db.query<TableRow>(
        `SELECT id, "companyId", "tableNo", "areaId", status
           FROM "RestaurantTable" WHERE "qrToken" = $1`,
        [clean],
      ),
    );

    if (!rows[0]) throw new NotFoundException('میزی با این کد یافت نشد');
    return rows[0];
  }

  private async settings(companyId: string): Promise<Settings> {
    const rows = await runInTenant({ companyId, userId: null }, () =>
      this.db.query<Settings>(
        'SELECT * FROM "SelfOrderSetting" WHERE "companyId" = $1',
        [companyId],
      ),
    );

    // ⚠️ نبودِ ردیف یعنی **پیش‌فرضِ محتاط**، نه «هرچه بخواهی».
    //
    //    رستورانی که هنوز تنظیمش نکرده، نباید ناخواسته سفارشِ آنلاین
    //    بپذیرد.  منو دیده می‌شود، سفارش نه.
    return (
      rows[0] ?? {
        menuEnabled: true,
        orderEnabled: false,
        requireApproval: true,
        requirePrepay: false,
        servicePercent: '0',
        taxPercent: '0',
        maxOrderAmount: '0',
        welcomeText: null,
      }
    );
  }

  /** منوی عمومیِ یک میز. */
  async menu(token: string) {
    const table = await this.tableByToken(token);
    const config = await this.settings(table.companyId);

    if (!config.menuEnabled) {
      throw new ForbiddenException('منوی دیجیتال این مجموعه فعال نیست');
    }

    const grouped = await runInTenant({ companyId: table.companyId, userId: null }, () =>
      this.restaurant.menu(table.companyId),
    );

    return {
      table: { tableNo: table.tableNo },
      welcomeText: config.welcomeText,
      canOrder: config.orderEnabled,
      servicePercent: Number(config.servicePercent),
      taxPercent: Number(config.taxPercent),
      // ⚠️ فقط ستون‌هایی که مشتری باید ببیند.
      //
      //    `cost` بهای تمام‌شده است و در پاسخِ عمومی یعنی حاشیهٔ سودِ
      //    رستوران روی اینترنت.  `companyId` و `station` هم به مشتری
      //    ربطی ندارند.
      // ⚠️ دستهٔ خالی نمایش داده نمی‌شود.
      //
      //    در پنل، «پیش‌غذا»ی بی‌آیتم یعنی «هنوز چیزی اضافه نکرده‌ام».
      //    برای مهمان یعنی «اینجا چیزی هست ولی بارگذاری نشد» — صفحه
      //    خراب به نظر می‌آید در حالی که درست است.
      categories: (grouped as unknown as PublicCategory[])
        .filter((category) => (category.items ?? []).length > 0)
        .map((category) => ({
        id: category.id,
        name: category.name,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        icon: category.icon,
        items: (category.items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          nameEn: item.nameEn,
          nameAr: item.nameAr,
          description: item.description,
          imageUrl: item.imageUrl,
          price: Number(item.price ?? 0),
          calories: item.calories,
          prepMinutes: item.prepMinutes,
          isSpicy: item.isSpicy,
          isVegan: item.isVegan,
        })),
      })),
    };
  }

  /** ثبتِ سفارش از سرِ میز. */
  async order(
    token: string,
    body: { items?: unknown; note?: unknown; phone?: unknown; guestCount?: unknown },
  ) {
    const table = await this.tableByToken(token);
    const config = await this.settings(table.companyId);

    if (!config.menuEnabled || !config.orderEnabled) {
      throw new ForbiddenException('ثبت سفارش از منوی دیجیتال فعال نیست');
    }
    if (table.status === 'OUT_OF_SERVICE') {
      throw new BadRequestException('این میز در حال حاضر سرویس‌دهی نمی‌کند');
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw new BadRequestException('سبد خالی است');

    // ⚠️ فقط `menuItemId` و `qty` از مشتری پذیرفته می‌شود.
    //
    //    نه قیمت، نه تخفیف، نه نام.  هر چیزِ دیگری که در بدنه باشد
    //    **دور ریخته می‌شود** — نه اینکه اعتبارسنجی شود.  فهرستِ سفید
    //    از فهرستِ سیاه امن‌تر است: میدانی که فردا اضافه شود، خودبه‌خود
    //    بیرون می‌ماند.
    const clean = items.map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const qty = Number(item.qty ?? 0);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 50) {
        throw new BadRequestException('تعداد هر قلم باید بین ۱ تا ۵۰ باشد');
      }
      const menuItemId = String(item.menuItemId ?? '').trim();
      if (!menuItemId) throw new BadRequestException('قلم نامعتبر است');
      return {
        menuItemId,
        qty,
        note: item.note ? String(item.note).slice(0, 200) : undefined,
      };
    });

    if (clean.length > 40) {
      throw new BadRequestException('تعداد اقلام سفارش بیش از حد است');
    }

    const guestCode = `T-${randomBytes(8).toString('base64url')}`;

    return runInTenant({ companyId: table.companyId, userId: null }, async () => {
      const order = (await this.restaurant.createOrder(
        table.companyId,
        // ⚠️ گارسون ندارد.  `null` عمدی است: نسبت دادنِ سفارش به یک
        //    کاربرِ ساختگی، گزارشِ عملکردِ کارکنان را خراب می‌کند.
        null,
        {
          type: OrderTypeDto.DINE_IN,
          tableId: table.id,
          items: clean,
          guestCount: Number(body.guestCount ?? 1) || 1,
          note: body.note ? String(body.note).slice(0, 500) : undefined,
          servicePercent: Number(config.servicePercent),
          taxPercent: Number(config.taxPercent),
        },
        { trustClient: false, source: 'SELF', guestCode, guestPhone: body.phone },
      )) as unknown as { id: string; orderNo: string; total: string };

      // ⚠️ سقف **پس از** محاسبهٔ سرور سنجیده می‌شود، نه روی جمعِ کلاینت.
      const cap = Number(config.maxOrderAmount);
      if (cap > 0 && Number(order.total) > cap) {
        // سفارش ساخته شده؛ باطلش می‌کنیم تا میز اشغال نماند.
        await this.db.execute(
          `UPDATE "RestaurantOrder" SET status = 'CANCELLED', "updatedAt" = now()
            WHERE id = $1 AND "companyId" = $2`,
          [order.id, table.companyId],
        );
        throw new BadRequestException(
          `مبلغ سفارش از سقف مجاز بیشتر است؛ لطفاً از گارسون کمک بگیرید`,
        );
      }

      return {
        guestCode,
        orderNo: order.orderNo,
        total: Number(order.total),
        needsApproval: config.requireApproval,
        needsPrepay: config.requirePrepay,
      };
    });
  }

  /** وضعیتِ سفارش با کدِ مهمان. */
  async status(guestCode: string) {
    const code = String(guestCode ?? '').trim();
    if (!code) throw new NotFoundException('کد پیگیری نیست');

    const rows = await runWithTrackCode(code, () =>
      this.db.query<{
        orderNo: string;
        status: string;
        total: string;
        paidAmount: string;
        bankRef: string | null;
        paidAt: Date | null;
        createdAt: Date;
      }>(
        `SELECT "orderNo", status, total, "paidAmount", "bankRef", "paidAt", "createdAt"
           FROM "RestaurantOrder" WHERE "guestCode" = $1`,
        [code],
      ),
    );

    if (!rows[0]) throw new NotFoundException('سفارشی با این کد یافت نشد');

    // ⚠️ شناسهٔ شرکت، شناسهٔ میز و نامِ گارسون بیرون نمی‌روند.
    //    دانستنِ کد یعنی «من همان مشتری‌ام»، نه دسترسی به پرونده.
    const row = rows[0];
    return {
      orderNo: row.orderNo,
      status: row.status,
      total: Number(row.total),
      paidAmount: Number(row.paidAmount ?? 0),
      bankRef: row.bankRef ?? null,
      paidAt: row.paidAt ?? null,
      createdAt: row.createdAt,
    };
  }

  /**
   * شروعِ پرداختِ آنلاین برای سفارشِ سرِ میز.
   *
   * ⚠️ مبلغ از **پایگاه‌داده** خوانده می‌شود، نه از درخواست.
   *
   *    همان درسی که فروشِ ماژولِ سایت داد.  اینجا حتی بدتر بود:
   *    مسیر عمومی است و کسی که کدِ مهمان را دارد می‌توانست مبلغِ
   *    دلخواهش را بفرستد.
   *
   * ⚠️ سفارشِ **پرداخت‌شده** دوباره به درگاه نمی‌رود.
   *
   *    بدونِ این، مشتری می‌توانست دو بار پرداخت کند و پولِ دومش
   *    جایی ثبت نمی‌شد — چون تأیید مبلغ را با کلِ سفارش می‌سنجد و
   *    بارِ دوم هم درست از آب درمی‌آمد.
   */
  async startPayment(guestCode: string, returnBase?: string) {
    const { row, companyId } = await this.orderByGuestCode(guestCode);

    if (row.status === 'PAID' || Number(row.paidAmount ?? 0) > 0) {
      throw new BadRequestException('این سفارش قبلاً پرداخت شده است');
    }
    if (row.status === 'CANCELLED') {
      throw new BadRequestException('سفارش لغو شده قابل پرداخت نیست');
    }

    const amount = Number(row.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ سفارش معتبر نیست');
    }

    const base = (returnBase || apiBase()).replace(/\/+$/, '');
    const started = await this.gateway.start({
      amount,
      orderNo: row.orderNo,
      callbackUrl: `${base}/menu/pay/callback?code=${encodeURIComponent(guestCode)}`,
      description: `پرداخت سفارش ${row.orderNo}`,
    });

    if (!started.ok || !started.redirectUrl) {
      throw new ServiceUnavailableException(
        started.error || 'اتصال به درگاه پرداخت ممکن نشد',
      );
    }

    await runInTenant({ companyId, userId: null }, () =>
      this.db.execute(
        `UPDATE "RestaurantOrder" SET "paymentRef" = $1, "updatedAt" = now() WHERE id = $2`,
        [started.reference ?? null, row.id],
      ),
    );

    return { paymentUrl: started.redirectUrl, amount };
  }

  /**
   * بازگشت از درگاه — تأیید **سمتِ سرور**.
   *
   * ⚠️ حرفِ درگاه در پارامترِ نشانی ملاک نیست؛ فقط پاسخِ `verify` از
   *    کانالِ پشتی.  نشانی در دستِ کاربر است.
   */
  async completePayment(guestCode: string) {
    const { row, companyId } = await this.orderByGuestCode(guestCode);

    if (row.status === 'PAID') {
      return { ok: true, guestCode, alreadyPaid: true };
    }
    if (!row.paymentRef) {
      throw new BadRequestException('این سفارش به درگاه نرفته است');
    }

    const amount = Number(row.total);
    const result = await this.gateway.verify(row.paymentRef, amount);

    if (!result.ok) {
      return { ok: false, guestCode, error: result.error ?? 'پرداخت تأیید نشد' };
    }

    // ⚠️ تطبیقِ مبلغ، حتی وقتی درگاه «موفق» گفته.
    //
    //    بدونش سفارشِ پانصدهزاری با پرداختِ هزارتومانی تأیید می‌شود.
    //    و مبلغِ **نامعلوم** هم رد می‌شود: نبودِ عدد اثباتِ چیزی نیست.
    if (typeof result.paidAmount !== 'number' || result.paidAmount !== amount) {
      return {
        ok: false,
        guestCode,
        error:
          typeof result.paidAmount === 'number'
            ? `مبلغ پرداختی با مبلغ سفارش نمی‌خواند (${result.paidAmount} در برابر ${amount})`
            : 'درگاه مبلغ پرداختی را تأیید نکرد',
      };
    }

    // ⚠️ `paidAt` جدا از `closedAt` — دلیلش در مهاجرت ۰۶۳.
    //    میز اینجا آزاد نمی‌شود: مشتری هنوز سرِ میز نشسته.
    await runInTenant({ companyId, userId: null }, () =>
      this.db.execute(
        `UPDATE "RestaurantOrder"
            SET "paidAmount" = $1, "bankRef" = $2, "paidAt" = now(),
                "paymentMethod" = 'ONLINE', "updatedAt" = now()
          WHERE id = $3`,
        [amount, result.trackingCode ?? null, row.id],
      ),
    );

    return { ok: true, guestCode, bankRef: result.trackingCode ?? null, amount };
  }

  /**
   * سفارش را از کدِ مهمان می‌گیرد — با شرکتش.
   *
   * ⚠️ روزنهٔ عمومی فقط `SELECT` است، پس برای نوشتن باید شرکت را
   *    بدانیم و از `runInTenant` برویم.  همان الگوی `tableByToken`.
   */
  private async orderByGuestCode(guestCode: string) {
    const code = String(guestCode ?? '').trim();
    if (!code) throw new NotFoundException('کد پیگیری نیست');

    const rows = await runWithTrackCode(code, () =>
      this.db.query<{
        id: string;
        companyId: string;
        orderNo: string;
        status: string;
        total: string;
        paidAmount: string | null;
        paymentRef: string | null;
      }>(
        `SELECT id, "companyId", "orderNo", status, total, "paidAmount", "paymentRef"
           FROM "RestaurantOrder" WHERE "guestCode" = $1`,
        [code],
      ),
    );

    if (!rows[0]) throw new NotFoundException('سفارشی با این کد یافت نشد');
    return { row: rows[0], companyId: rows[0].companyId };
  }
}

/**
 * نشانیِ عمومیِ API — بازگشتِ درگاه به همین‌جا می‌آید.
 *
 * ⚠️ از پیکربندی، نه از سربرگِ `Host`: خواندنش از درخواست یعنی مهاجم
 *    می‌تواند کاربر را پس از پرداخت به سایتِ خودش ببرد.
 */
function apiBase(): string {
  return (
    process.env.API_PUBLIC_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

type PublicItem = Record<string, unknown>;

type PublicCategory = {
  id: string | null;
  name: string;
  nameEn?: string | null;
  nameAr?: string | null;
  icon?: string | null;
  items?: PublicItem[];
};
