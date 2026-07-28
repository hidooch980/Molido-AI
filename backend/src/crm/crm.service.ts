import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * باشگاه مشتریان — امتیاز وفاداری، سطح‌بندی و کوپن تخفیف.
 *
 * سطح از روی امتیاز محاسبه می‌شود و دستی قابل تغییر نیست تا سطح‌بندی
 * همیشه با امتیاز هم‌خوان بماند.
 */

/** آستانه امتیاز هر سطح — از بالا به پایین بررسی می‌شود. */
const TIERS: Array<{ tier: string; min: number }> = [
  { tier: 'VIP', min: 20000 },
  { tier: 'GOLD', min: 5000 },
  { tier: 'SILVER', min: 1000 },
  { tier: 'BRONZE', min: 0 },
];

/** به ازای هر این مقدار ریال خرید، یک امتیاز. */
const RIALS_PER_POINT = 10000;

function tierFor(points: number): string {
  return TIERS.find((t) => points >= t.min)?.tier ?? 'BRONZE';
}

const CUSTOMER_SELECT = {
  select: { id: true, firstName: true, lastName: true, phone: true },
};

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: any = {}) {
    const where: any = { companyId };

    if (query.tier) where.tier = query.tier;

    if (query.search) {
      where.customer = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      };
    }

    return this.prisma.loyaltyAccount.findMany({
      where,
      // بدون مشتری، رابط کاربری فقط شناسه می‌بیند و نامی برای نمایش ندارد.
      include: { customer: CUSTOMER_SELECT },
      orderBy: { points: 'desc' },
      take: query.limit ? Number(query.limit) : 100,
    });
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.loyaltyAccount.findFirst({
      where: { id, companyId },
      include: { customer: CUSTOMER_SELECT },
    });

    if (!item) throw new NotFoundException('عضو باشگاه مشتریان یافت نشد');

    return item;
  }

  /** عضویت مشتری در باشگاه. */
  async create(companyId: string, data: any) {
    const customerId = String(data?.customerId ?? '');

    if (!customerId) {
      throw new BadRequestException('مشتری مشخص نشده است');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
    });

    if (!customer) throw new NotFoundException('مشتری یافت نشد');

    // customerId در مدل یکتاست؛ بدون این بررسی خطای خام Prisma برمی‌گشت.
    const existing = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });

    if (existing) {
      throw new ConflictException('این مشتری قبلاً عضو باشگاه است');
    }

    const points = Math.max(0, Math.round(Number(data?.points ?? 0)));

    return this.prisma.loyaltyAccount.create({
      data: {
        companyId,
        customerId,
        points,
        tier: tierFor(points) as never,
        note: data?.note ?? null,
      },
      include: { customer: CUSTOMER_SELECT },
    });
  }

  /**
   * افزودن یا کسر امتیاز؛ `delta` منفی یعنی استفاده از امتیاز.
   * سطح پس از تغییر بازمحاسبه می‌شود.
   */
  async addPoints(companyId: string, id: string, delta: number) {
    const account = await this.findOne(companyId, id);

    const next = Number(account.points) + Math.round(Number(delta) || 0);

    if (next < 0) {
      throw new BadRequestException('امتیاز کافی نیست');
    }

    return this.prisma.loyaltyAccount.update({
      where: { id },
      data: { points: next, tier: tierFor(next) as never },
      include: { customer: CUSTOMER_SELECT },
    });
  }

  /**
   * ثبت امتیاز بابت خرید. اگر مشتری عضو نباشد بی‌صدا رد می‌شود تا ثبت
   * فروش به‌خاطر باشگاه مشتریان شکست نخورد.
   */
  async earnFromPurchase(companyId: string, customerId: string, amount: number) {
    const account = await this.prisma.loyaltyAccount.findFirst({
      where: { companyId, customerId },
    });

    if (!account) return null;

    const earned = Math.floor(Number(amount) / RIALS_PER_POINT);

    if (earned <= 0) return account;

    const next = account.points + earned;

    return this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: { points: next, tier: tierFor(next) as never },
    });
  }

  async update(companyId: string, id: string, data: any) {
    await this.findOne(companyId, id);

    // امتیاز فقط از مسیر addPoints تغییر کند و سطح همیشه مشتق امتیاز بماند.
    const {
      points: _p,
      tier: _t,
      companyId: _c,
      customerId: _cu,
      ...safe
    } = data ?? {};

    return this.prisma.loyaltyAccount.update({
      where: { id },
      data: safe,
      include: { customer: CUSTOMER_SELECT },
    });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);

    return this.prisma.loyaltyAccount.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const accounts = await this.prisma.loyaltyAccount.findMany({
      where: { companyId },
      select: { points: true, tier: true },
    });

    const byTier: Record<string, number> = {
      BRONZE: 0,
      SILVER: 0,
      GOLD: 0,
      VIP: 0,
    };

    for (const a of accounts) {
      byTier[a.tier] = (byTier[a.tier] ?? 0) + 1;
    }

    return {
      total: accounts.length,
      totalPoints: accounts.reduce((s, a) => s + a.points, 0),
      byTier,
      rialsPerPoint: RIALS_PER_POINT,
    };
  }

  // ═══════════════ کوپن تخفیف ═══════════════

  coupons(companyId: string) {
    return this.prisma.coupon.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createCoupon(companyId: string, data: any) {
    const code = String(data?.code ?? '')
      .trim()
      .toUpperCase();

    if (!code) throw new BadRequestException('کد کوپن لازم است');

    const percent = data?.percent != null ? Number(data.percent) : null;
    const amount = data?.amount != null ? Number(data.amount) : null;

    if (percent == null && amount == null) {
      throw new BadRequestException('درصد یا مبلغ تخفیف را مشخص کنید');
    }

    if (percent != null && (percent <= 0 || percent > 100)) {
      throw new BadRequestException('درصد تخفیف باید بین ۱ تا ۱۰۰ باشد');
    }

    if (amount != null && amount <= 0) {
      throw new BadRequestException('مبلغ تخفیف باید بزرگ‌تر از صفر باشد');
    }

    // کد کوپن در کل سامانه یکتاست، نه فقط در یک شرکت.
    const exists = await this.prisma.coupon.findUnique({ where: { code } });

    if (exists) throw new ConflictException('کوپنی با این کد وجود دارد');

    return this.prisma.coupon.create({
      data: {
        companyId,
        code,
        percent,
        amount,
        maxUses: Math.max(0, Number(data?.maxUses ?? 0)),
        expiresAt: data?.expiresAt ? new Date(data.expiresAt) : null,
        isActive: true,
      },
    });
  }

  /** اعتبارسنجی کوپن و محاسبه تخفیف روی یک مبلغ. */
  async validateCoupon(companyId: string, code: string, orderAmount = 0) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        companyId,
        code: String(code ?? '')
          .trim()
          .toUpperCase(),
      },
    });

    if (!coupon) throw new NotFoundException('کوپن یافت نشد');

    if (!coupon.isActive) {
      throw new BadRequestException('این کوپن غیرفعال است');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('اعتبار این کوپن تمام شده است');
    }

    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('سقف استفاده از این کوپن پر شده است');
    }

    const amount = Math.max(0, Number(orderAmount) || 0);

    const discount = coupon.percent
      ? Math.round((amount * coupon.percent) / 100)
      : Math.min(Number(coupon.amount ?? 0), amount);

    return { coupon, discount };
  }

  /** ثبت مصرف کوپن — پس از استفاده در فاکتور. */
  async redeemCoupon(companyId: string, code: string, orderAmount = 0) {
    const { coupon, discount } = await this.validateCoupon(
      companyId,
      code,
      orderAmount,
    );

    await this.prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });

    return { code: coupon.code, discount };
  }

  async setCouponActive(companyId: string, id: string, isActive: boolean) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { id, companyId },
    });

    if (!coupon) throw new NotFoundException('کوپن یافت نشد');

    return this.prisma.coupon.update({ where: { id }, data: { isActive } });
  }
}
