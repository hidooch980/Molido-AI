import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { Params } from '../database/sql';
import { applyStockDelta } from '../inventory/inventory.service';
import { RationService } from '../ration/ration.service';
import { PostingService } from '../accounting/posting.service';
import { cogsEntry, collectionEntry, saleEntry } from '../accounting/posting-rules';
import { N8nService } from '../n8n/n8n.service';
import { CashierShiftService } from '../retail/cashier-shift.service';
import { PricingService } from '../pricing/pricing.service';
import { TaxService } from '../tax/tax.service';
import { CreateSaleDto } from './dto/create-sale.dto';

type Sale = Record<string, unknown> & { id: string; status: string; total: string };
type SaleItem = Record<string, unknown> & { id: string; productId: string; quantity: string };
type SaleDetail = Sale & {
  customer: Record<string, unknown> | null;
  user: Record<string, unknown> | null;
  warehouse: Record<string, unknown> | null;
  items: SaleItem[];
  payments: Array<Record<string, unknown>>;
};

/**
 * فرار کاراکترهای HTML.
 *
 * نام کالا، نام مشتری و مشخصات شرکت همه از دیتابیس می‌آیند و مستقیم داخل
 * قالب فاکتور می‌نشینند.  نامی که `<` داشته باشد — چه از سر شیطنت، چه
 * تصادفی — قالب را می‌شکند یا اسکریپت اجرا می‌کند.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MAX_PAGE_SIZE = 200;
const DEFAULT_INSTALLMENT_INTERVAL_DAYS = 30;

@Injectable()
export class SalesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly n8n: N8nService,
    private readonly shifts: CashierShiftService,
    // کالابرگ فقط در محصول فروشگاه هست؛ رستوران بدون آن هم باید بفروشد.
    @Optional() @Inject(RationService)
    private readonly ration: RationService | null,
    private readonly posting: PostingService,
    // قیمت‌گذاری در پروفایل‌های دیگر ممکن است بارگذاری نشده باشد؛ نبودش
    // یعنی بازگشت به قیمت پایهٔ کالا، نه شکستن فروش.
    @Optional() @Inject(PricingService)
    private readonly pricing: PricingService | null,
    // ارسال مالیاتی فقط در پروفایل مالی هست و ممکن است اصلاً فعال نباشد.
    @Optional() @Inject(TaxService)
    private readonly tax: TaxService | null,
  ) {}

  async findAll(
    companyId: string,
    options?: { status?: string; from?: string; to?: string; page?: number; limit?: number },
  ) {
    const params = new Params();
    const conditions = [`s."companyId" = ${params.next(companyId)}`];
    if (options?.status) conditions.push(`s.status = ${params.next(options.status)}`);
    if (options?.from) conditions.push(`s."createdAt" >= ${params.next(new Date(options.from))}`);
    if (options?.to) conditions.push(`s."createdAt" <= ${params.next(new Date(options.to))}`);
    const where = `WHERE ${conditions.join(' AND ')}`;

    const select = `
      SELECT s.*,
             c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName",
             u."firstName" AS "userFirstName", u."lastName" AS "userLastName",
             (SELECT count(*)::int FROM "SaleItem" i WHERE i."saleId" = s.id) AS "itemsCount"
      FROM "Sale" s
      LEFT JOIN "Customer" c ON c.id = s."customerId"
      LEFT JOIN "User" u ON u.id = s."userId"
      ${where} ORDER BY s."createdAt" DESC`;

    const take =
      options?.limit && options.limit > 0 ? Math.min(options.limit, MAX_PAGE_SIZE) : undefined;

    if (!take) return this.db.query<Sale>(select, params.values);

    const page = options?.page && options.page > 0 ? options.page : 1;
    const scoped = params.values.slice();
    const data = await this.db.query<Sale>(
      `${select} LIMIT ${params.next(take)} OFFSET ${params.next((page - 1) * take)}`,
      params.values,
    );
    const counted = await this.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "Sale" s ${where}`,
      scoped,
    );
    const total = Number(counted[0]?.count ?? 0);

    return { data, total, page, limit: take, totalPages: Math.ceil(total / take) };
  }

  async findOne(id: string, companyId: string): Promise<SaleDetail> {
    const sales = await this.db.query<Sale>(
      'SELECT * FROM "Sale" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!sales[0]) throw new NotFoundException('فاکتور فروش یافت نشد');

    const [customers, users, warehouses, items, payments] = await Promise.all([
      sales[0].customerId
        ? this.db.query('SELECT * FROM "Customer" WHERE id = $1', [sales[0].customerId])
        : Promise.resolve([]),
      this.db.query('SELECT id, "firstName", "lastName" FROM "User" WHERE id = $1', [
        sales[0].userId,
      ]),
      this.db.query('SELECT id, name FROM "Warehouse" WHERE id = $1', [sales[0].warehouseId]),
      this.db.query<SaleItem>(
        `SELECT i.*, p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit",
                json_build_object('id', p.id, 'name', p.name, 'sku', p.sku, 'unit', p.unit) AS product
         FROM "SaleItem" i JOIN "Product" p ON p.id = i."productId" WHERE i."saleId" = $1`,
        [id],
      ),
      this.db.query('SELECT * FROM "Payment" WHERE "saleId" = $1', [id]),
    ]);

    return {
      ...sales[0],
      customer: customers[0] ?? null,
      user: users[0] ?? null,
      warehouse: warehouses[0] ?? null,
      items,
      payments,
    };
  }

  /**
   * ثبت فاکتور فروش:
   * - محاسبه خودکار مبالغ
   * - کاهش خودکار موجودی انبار (تراکنشی)
   * - ثبت پرداخت و به‌روزرسانی صندوق (اختیاری)
   */
  /**
   * `options.agreedPrices` — قیمت توافقیِ سفارش فروش یا پیش‌فاکتور.
   *
   * عمداً **پارامتر تابع** است، نه میدان DTO: از HTTP دست‌نیافتنی می‌ماند
   * و فقط مسیرهای داخلی (تبدیل سفارش به فاکتور) می‌توانند بفرستندش.
   * اگر در DTO بود، همان حفرهٔ «قیمت را کلاینت تعیین می‌کند» دوباره باز
   * می‌شد — که پیش از این با تخفیفِ دستی هم رخ داده بود.
   *
   * بدون این، قیمتی که با مشتری توافق شده هنگام صدور فاکتور بی‌صدا
   * دور ریخته می‌شد و قیمت روز کاتالوگ جایش می‌نشست.
   */
  async create(
    dto: CreateSaleDto,
    companyId: string,
    userId: string,
    options?: { agreedPrices?: Map<string, number> },
  ) {
    // فاکتور صندوق خودکار به شیفت باز همان کاربر گره می‌خورد؛ فروش خارج از
    // صندوق (بدون شیفت) همچنان مجاز است.
    const shiftId = (await this.shifts.current(companyId, userId))?.id ?? null;

    const sale = await this.db.transaction(async (tx) => {
      const warehouses = await tx.query<{ id: string }>(
        'SELECT id FROM "Warehouse" WHERE id = $1 AND "companyId" = $2',
        [dto.warehouseId, companyId],
      );
      if (!warehouses.rows[0]) throw new NotFoundException('انبار یافت نشد');

      const productIds = dto.items.map((item) => item.productId);
      const products = await tx.query<{
        id: string;
        name: string;
        salePrice: string;
        purchasePrice: string;
        trackInventory: boolean;
        taxRate: string | null;
      }>(
        `SELECT id, name, "salePrice", "purchasePrice", "trackInventory", "taxRate"
         FROM "Product" WHERE id = ANY($1) AND "companyId" = $2`,
        [productIds, companyId],
      );
      if (products.rows.length !== new Set(productIds).size) {
        throw new BadRequestException('برخی کالاها یافت نشدند');
      }
      const productMap = new Map(products.rows.map((product) => [product.id, product]));

      // قیمت و تخفیف خودکار را **سرور** تعیین می‌کند، نه صندوق.
      //
      // پیش از این `item.price` که کلاینت می‌فرستاد پذیرفته می‌شد؛ یعنی
      // هر کسی با توکن صندوق‌دار می‌توانست فاکتور را به هر مبلغی ثبت کند.
      // قیمت‌گذاری همان‌جایی است که سوءاستفاده اتفاق می‌افتد، پس عددی که
      // مبلغ فاکتور را می‌سازد نباید از کلاینت بیاید.
      //
      // خواندن قیمت بیرون از تراکنش انجام می‌شود: جدول‌های قیمت در همین
      // تراکنش تغییر نمی‌کنند، و بردنشان به داخل چیزی را امن‌تر نمی‌کند.
      const quote = this.pricing
        ? await this.pricing.quote(
            companyId,
            dto.items.map((item) => ({
              productId: item.productId,
              qty: item.quantity,
            })),
            { customerId: dto.customerId, code: dto.discountCode },
          )
        : null;

      // کد نامعتبر بی‌سروصدا نادیده گرفته نمی‌شود: صندوق‌دار به مشتری
      // گفته «تخفیف اعمال شد» و فاکتور باید همان را نشان دهد یا خطا.
      if (dto.discountCode && quote?.codeError) {
        throw new BadRequestException(quote.codeError);
      }

      // سقف تخفیف دستی.
      //
      // تخفیف قلمی بدون سقف یعنی صندوق‌دار می‌تواند کالا را رایگان بدهد —
      // پرتکرارترین شکل سوءاستفاده در خرده‌فروشی.  سقف در سطح شرکت تعریف
      // می‌شود و صفر یعنی «تخفیف دستی ممنوع».
      const [company] = await tx.query<{ maxLineDiscountPercent: string }>(
        'SELECT "maxLineDiscountPercent" FROM "Company" WHERE id = $1',
        [companyId],
      ).then((r) => r.rows);

      const maxPercent = Number(company?.maxLineDiscountPercent ?? 0);

      let subtotal = 0;
      let lineTax = 0;
      const itemsData = dto.items.map((item, index) => {
        const product = productMap.get(item.productId)!;
        // ترتیب خطوط قیمت‌دهی همان ترتیب ورودی است؛ کالای وزنی برای هر
        // بسته سطر جدا دارد و نباید با هم ادغام شوند.
        const priced = quote?.lines[index];

        // قیمت توافقی مقدم است؛ بعد قیمت‌گذاری، بعد قیمت کاتالوگ.
        const agreed = options?.agreedPrices?.get(item.productId);
        const price =
          agreed !== undefined && agreed >= 0
            ? agreed
            : priced
              ? Number(priced.unitPrice)
              : Number(product.salePrice);
        const autoDiscount = priced ? Number(priced.discount) : 0;

        // تخفیف دستیِ همین قلم — جدا از تخفیف خودکار قواعد.
        //
        // جدا نگه داشتنشان لازم است: تخفیف خودکار سیاست فروشگاه است و
        // تخفیف دستی تصمیم صندوق‌دار.  در گزارش پایان شیفت باید بشود
        // دومی را جدا دید.
        const gross = price * item.quantity;
        const requested = Math.max(0, Number(item.manualDiscount ?? 0));

        let manual = 0;

        if (requested > 0) {
          if (maxPercent <= 0) {
            throw new BadRequestException('تخفیف دستی در این فروشگاه مجاز نیست');
          }

          const ceiling = (gross * maxPercent) / 100;

          if (requested > ceiling) {
            throw new BadRequestException(
              `تخفیف «${product.name}» بیشتر از سقف مجاز (${maxPercent}٪) است`,
            );
          }

          manual = requested;
        }

        // تخفیف کل هرگز از مبلغ سطر بیشتر نشود، وگرنه مبلغ فاکتور منفی
        // می‌شود و از آنجا به بعد همه‌چیز خراب است.
        const discount = Math.min(autoDiscount + manual, gross);
        const total = gross - discount;

        // مالیات هر ردیف از نرخ خودِ کالا، نه یک نرخ برای کل فاکتور.
        //
        // فروشگاهی که هم کالای مشمول دارد و هم معاف (مواد خام معاف
        // است، بسته‌بندی نه)، با یک نرخ سراسری همیشه مبلغ غلط می‌دهد —
        // و صورتحساب مؤدیان با فاکتور نمی‌خواند.
        //
        // پایه، مبلغ **پس از تخفیف** است؛ مالیات روی چیزی که مشتری
        // نپرداخته بسته نمی‌شود.
        const taxRate = Math.max(0, Math.min(Number(product.taxRate ?? 0), 100));
        const taxAmount = Math.round((total * taxRate) / 100);

        subtotal += total;
        lineTax += taxAmount;
        return {
          ...item,
          price,
          discount,
          manualDiscount: manual,
          total,
          taxRate,
          taxAmount,
        };
      });

      // تخفیف سطح فاکتور — با **همان** سقفی که تخفیف قلمی دارد.
      //
      // بدون این، سقف تخفیف قلمی بی‌معنا بود: صندوق‌داری که نمی‌توانست
      // روی یک قلم ۱۰٪ تخفیف بدهد، می‌توانست همان مبلغ را در
      // `discount` سطح فاکتور بفرستد و کل فاکتور را رایگان کند.
      // پرتکرارترین شکل سوءاستفاده در خرده‌فروشی همین است.
      const requestedDiscount = Math.max(0, Number(dto.discount ?? 0));
      let discount = 0;

      if (requestedDiscount > 0) {
        if (maxPercent <= 0) {
          throw new BadRequestException('تخفیف در این فروشگاه مجاز نیست');
        }

        // پایه، جمع اقلام **پس از** تخفیف قلمی است: وگرنه دو تخفیف روی
        // هم می‌نشینند و مجموعشان از سقف رد می‌شود.
        const ceiling = Math.round((subtotal * maxPercent) / 100);
        if (requestedDiscount > ceiling) {
          throw new BadRequestException(
            `تخفیف فاکتور بیشتر از سقف مجاز (${maxPercent}٪) است`,
          );
        }
        discount = requestedDiscount;
      }

      // مالیات ارسالی از کلاینت فقط وقتی به کار می‌آید که هیچ کالایی
      // نرخ نداشته باشد — وگرنه جمع نرخ‌های ردیفی ملاک است.  اگر هر دو
      // را جمع کنیم، مالیات دو بار بسته می‌شود.
      // تخفیف سطح فاکتور، پایهٔ مالیات را هم کم می‌کند.
      //
      // بدون این، مالیات روی مبلغی بسته می‌شد که مشتری نپرداخته — و
      // چون مالیات ردیفی پیش از این تخفیف حساب شده بود، مبلغ فاکتور با
      // محاسبهٔ سمت فرم هم نمی‌خواند.
      //
      // سهم هر ردیف به نسبت کم می‌شود، نه اینکه یک عدد کلی جایگزین
      // شود: صورتحساب مؤدیان مالیات را **به تفکیک ردیف** می‌خواهد و اگر
      // جمع ردیف‌ها با سربرگ نخواند، رد می‌شود.
      const taxScale = subtotal > 0 ? (subtotal - discount) / subtotal : 1;

      let tax = 0;
      if (lineTax > 0) {
        for (const item of itemsData) {
          item.taxAmount = Math.round(item.taxAmount * taxScale);
          tax += item.taxAmount;
        }
      } else {
        tax = Math.round((dto.tax ?? 0) * taxScale);
      }
      // اضافات (کرایه، بسته‌بندی) و کسورات (گرد کردن، کسر توافقی).  جدا از
      // تخفیف نگه داشته می‌شوند چون هم سند حسابداری‌شان فرق دارد و هم
      // گزارش تخفیف را دروغ می‌کنند اگر با هم قاطی شوند.
      const additions = dto.additions ?? 0;
      const deductions = dto.deductions ?? 0;
      const total = subtotal - discount + tax + additions - deductions;
      if (total < 0) throw new BadRequestException('مبلغ فاکتور نامعتبر است');

      // شناسه پیش از کسر موجودی ساخته می‌شود چون حرکت انبار باید به همین
      // فاکتور ارجاع دهد؛ رکورد Sale کمی پایین‌تر با همین شناسه درج می‌شود.
      const saleId = randomUUID();

      // ویزیتورِ فروش: اگر صریحاً داده نشده، از ویزیتورِ ثابتِ مشتری
      // برداشته می‌شود.  بیشتر فروش‌های عمده از مسیر ویزیتور ثابت می‌آیند و
      // اگر اینجا پر نشود، کمیسیون آن ویزیتور همیشه صفر می‌ماند.
      let salesAgentId = dto.salesAgentId ?? null;

      if (!salesAgentId && dto.customerId) {
        const owner = await tx.query<{ salesAgentId: string | null }>(
          'SELECT "salesAgentId" FROM "Customer" WHERE id = $1',
          [dto.customerId],
        );
        salesAgentId = owner.rows[0]?.salesAgentId ?? null;
      }

      // پورسانت را همین‌جا حساب و ثبت می‌کنیم، نه در گزارش.
      //
      // نرخ ویزیتور فردا عوض می‌شود؛ اگر مبلغ را هر بار از نرخِ روز
      // حساب کنیم، تسویهٔ ماه گذشته با تغییر امروز به هم می‌ریزد و هیچ
      // ردی هم نمی‌ماند که چرا.
      //
      // پایه: مبلغ اقلام پس از تخفیف، بدون مالیات و کرایه — ویزیتور
      // بابت مالیاتِ دولت پورسانت نمی‌گیرد.
      let agentCommission = 0;
      if (salesAgentId) {
        const agent = await tx.query<{ commissionRate: string | null }>(
          'SELECT "commissionRate" FROM "SalesAgent" WHERE id = $1 AND "companyId" = $2',
          [salesAgentId, companyId],
        );
        const rate = Number(agent.rows[0]?.commissionRate ?? 0);
        if (rate > 0) {
          agentCommission = Math.round(((subtotal - discount) * rate) / 100);
        }
      }

      // کاهش موجودی انبار
      for (const item of itemsData) {
        const product = productMap.get(item.productId)!;
        if (!product.trackInventory) continue;

        const updated = await applyStockDelta(
          tx,
          dto.warehouseId,
          item.productId,
          -item.quantity,
          { companyId, reason: 'SALE', refType: 'SALE', refId: saleId, userId },
        );
        if (!updated) {
          throw new BadRequestException(`موجودی کالای «${product.name}» کافی نیست`);
        }
      }

      // ⚠️ بهای تمام‌شده **همین‌جا** قفل می‌شود، پیش از ثبتِ سطرها.
      //
      //    همین یک عدد در سه جا به‌کار می‌رود: `SaleItem."unitCost"`،
      //    سندِ `SaleCogs`، و بعداً مرجوعی.  اگر هر کدام جدا حساب
      //    می‌شد، خریدِ بعدی میانگین را عوض می‌کرد و اعداد از هم
      //    فاصله می‌گرفتند — همان نشتی که مرجوعی داشت.
      //
      //    خواندن پس از `applyStockDelta` است ولی مقدارش همان است:
      //    خروج میانگین را تغییر نمی‌دهد.
      const costRows = await tx.query<{ productId: string; avgCost: string | null }>(
        `SELECT "productId", "avgCost" FROM "Inventory"
          WHERE "warehouseId" = $1 AND "productId" = ANY($2)`,
        [dto.warehouseId, itemsData.map((line) => line.productId)],
      );
      const avgByProduct = new Map(
        costRows.rows.map((row) => [row.productId, row.avgCost]),
      );

      /** بهای واحد؛ عقب‌گرد به آخرین بهای خرید وقتی میانگینی نیست. */
      const unitCostOf = (productId: string): number => {
        const avg = avgByProduct.get(productId);
        if (avg !== null && avg !== undefined) return Number(avg);
        return Number(productMap.get(productId)?.purchasePrice ?? 0);
      };

      // تسویه یا چندبخشی است یا شکل قدیمی تک‌روشی؛ هر دو به یک لیست تبدیل
      // می‌شوند تا مسیر ثبت پرداخت یکی بماند.
      const tenders =
        dto.payments?.length
          ? dto.payments.map((payment) => ({
              method: payment.method,
              amount: Number(payment.amount),
              cashBoxId: payment.cashBoxId ?? dto.cashBoxId ?? null,
              referenceNo: payment.referenceNo ?? null,
            }))
          : dto.paidAmount && dto.paidAmount > 0
            ? [
                {
                  method: dto.paymentMethod ?? 'CASH',
                  amount: Number(dto.paidAmount),
                  cashBoxId: dto.cashBoxId ?? null,
                  referenceNo: null,
                },
              ]
            : [];

      // سهم کالابرگ پیش از سایر روش‌ها حساب می‌شود: مبلغ آن از دیتابیس مشتق
      // می‌شود (قیمت مصوب کالای مشمول) و صندوق نمی‌تواند آن را تعیین کند.
      let rationAmount = 0;
      if (dto.rationAccountId) {
        if (!this.ration) {
          throw new BadRequestException('کالابرگ در این نسخه فعال نیست');
        }

        const eligibility = await this.ration.eligibility(
          companyId,
          itemsData.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        );

        if (eligibility.eligibleTotal <= 0) {
          throw new BadRequestException('هیچ‌یک از اقلام سبد مشمول کالابرگ نیست');
        }

        // کالابرگ بیش از مبلغ قابل پرداخت فاکتور برداشت نمی‌کند.
        rationAmount = Math.min(eligibility.eligibleTotal, total);
      }

      // نسیه پرداخت نیست، **تعهد** است.
      //
      // اگر در جمع پرداختی بیاید، فاکتور نسیه «تسویه‌شده» ثبت می‌شود و
      // از گزارش مطالبات بیرون می‌ماند — یعنی طلبی که هیچ‌کس دنبالش
      // نمی‌رود.  سند حسابداری‌اش از قبل درست بود (حساب دریافتنی)، ولی
      // وضعیت فاکتور و موجودی صندوق غلط می‌شد.
      const CREDIT = 'CREDIT';
      const settledTenders = tenders.filter((tender) => tender.method !== CREDIT);

      const paidAmount =
        settledTenders.reduce((sum, tender) => sum + tender.amount, 0) + rationAmount;
      if (paidAmount > total) {
        throw new BadRequestException('مبلغ پرداختی بیشتر از مبلغ فاکتور است');
      }

      const status = paidAmount >= total ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

      const created = await tx.query<Sale>(
        `INSERT INTO "Sale"
           (id, "companyId", "customerId", "userId", "warehouseId", "shiftId", "invoiceNo",
            status, subtotal, discount, tax, total, "rationAccountId", "rationAmount", note, "discountCodeId",
            "salesAgentId", reference, "dueDate", additions, deductions,
            "invoiceDate", "agentCommission")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING *`,
        [
          saleId,
          companyId,
          dto.customerId ?? null,
          userId,
          dto.warehouseId,
          shiftId ?? null,
          `INV-${Date.now()}`,
          status,
          subtotal,
          discount,
          tax,
          total,
          dto.rationAccountId ?? null,
          rationAmount,
          dto.note ?? null,
          quote?.codeId ?? null,
          salesAgentId,
          dto.reference?.trim() || null,
          dto.dueDate ?? null,
          additions,
          deductions,
          // تاریخ فاکتور، نه لحظهٔ ثبت.  فاکتوری که امروز برای فروش
          // دیروز زده می‌شود باید در گزارش دیروز بنشیند.
          dto.invoiceDate ?? null,
          agentCommission,
        ],
      );
      const sale = created.rows[0];

      // مصرف کد و شناسایی، **پس از** ساخته شدن فاکتور و داخل همان تراکنش:
      // اگر بیرون بود، شکست ثبت فاکتور کد را سوزانده رها می‌کرد.
      if (quote?.codeId) {
        await tx.query(
          `UPDATE "DiscountCode"
              SET "usedCount" = "usedCount" + 1,
                  "redeemedAt" = COALESCE("redeemedAt", now()),
                  "updatedAt" = now()
            WHERE id = $1 AND "usedCount" < "maxUses"`,
          [quote.codeId],
        );
      }

      if (dto.checkinId) {
        await tx.query(
          `UPDATE "CustomerCheckin"
              SET "usedAt" = now(), "saleId" = $1
            WHERE id = $2 AND "companyId" = $3 AND "usedAt" IS NULL`,
          [sale.id, dto.checkinId, companyId],
        );
      }

      if (rationAmount > 0 && this.ration) {
        await this.ration.spendIn(
          tx,
          companyId,
          dto.rationAccountId as string,
          rationAmount,
          sale.id,
        );
      }

      const items: SaleItem[] = [];
      for (const item of itemsData) {
        const row = await tx.query<SaleItem>(
          `INSERT INTO "SaleItem" (id, "saleId", "productId", quantity, price, discount, total, "manualDiscount", note, "taxRate", "taxAmount", serial, "unitCost")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
          [
            randomUUID(),
            sale.id,
            item.productId,
            item.quantity,
            item.price,
            item.discount,
            item.total,
            item.manualDiscount ?? 0,
            item.note?.trim() || null,
            item.taxRate,
            item.taxAmount,
            item.serial?.trim() || null,
            // بهایی که این فاکتور واقعاً با آن خرج خورد — مرجوعی و
            // گزارشِ سود به همین نگاه می‌کنند، نه به بهای امروز.
            unitCostOf(item.productId),
          ],
        );
        items.push(row.rows[0]);
      }

      // ثبت پرداخت‌ها — هر بخش یک رکورد، تا گزارش نقد/کارت شیفت دقیق بماند
      for (const tender of tenders) {
        await tx.query(
          `INSERT INTO "Payment"
             (id, "saleId", "cashBoxId", method, status, amount, "referenceNo")
           VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6)`,
          [
            randomUUID(),
            sale.id,
            tender.cashBoxId,
            tender.method,
            tender.amount,
            tender.referenceNo,
          ],
        );

        // صندوق فقط با پول واقعی بالا می‌رود.  نسیه هیچ وجهی وارد
        // صندوق نمی‌کند و اگر اینجا اضافه شود، تراز آخر روز به اندازهٔ
        // همان نسیه اضافه می‌آید و صندوق‌دار دنبال پولی می‌گردد که
        // اصلاً دریافت نشده.
        if (tender.cashBoxId && tender.method !== 'CREDIT') {
          const credited = await tx.query<{ id: string }>(
            `UPDATE "CashBox" SET balance = balance + $1, "updatedAt" = now()
             WHERE id = $2 AND "companyId" = $3 RETURNING id`,
            [tender.amount, tender.cashBoxId, companyId],
          );
          if (!credited.rows[0]) throw new NotFoundException('صندوق یافت نشد');
        }
      }

      // ---------- سند حسابداری ----------
      // داخل همان تراکنش صادر می‌شود؛ اگر سند نخورد، فاکتور هم ثبت نمی‌شود و
      // دفتر با عملیات هم‌گام می‌ماند.
      await this.posting.postAuto(tx, companyId, {
        sourceType: 'Sale',
        sourceId: sale.id,
        description: `فاکتور فروش ${sale.invoiceNo}`,
        userId,
        lines: saleEntry({
          subtotal,
          discount,
          tax,
          total,
          rationAmount,
          additions,
          deductions,
          tenders: tenders.map((tender) => ({
            method: tender.method,
            amount: tender.amount,
          })),
        }),
      });

      // بهای تمام‌شده جدا صادر می‌شود تا در گزارش مستقل دیده شود.
      //
      // ⚠️ از همان `unitCostOf` استفاده می‌شود که در سطرها ثبت شد.
      //
      //    محاسبهٔ دوبارهٔ اینجا یعنی سندِ حسابداری و ستونِ
      //    `SaleItem."unitCost"` می‌توانستند از هم فاصله بگیرند — و
      //    آن‌وقت مرجوعی هم با هیچ‌کدام جور درنمی‌آمد.
      const cost = itemsData.reduce(
        (sum, item) => sum + unitCostOf(item.productId) * item.quantity,
        0,
      );

      await this.posting.postAuto(tx, companyId, {
        sourceType: 'SaleCogs',
        sourceId: sale.id,
        description: `بهای تمام‌شدهٔ فاکتور ${sale.invoiceNo}`,
        userId,
        lines: cogsEntry(Math.round(cost * 100) / 100),
      });

      return { ...sale, items, payments: tenders, rationAmount };
    });

    // پس از قطعی شدن فاکتور، نه داخل تراکنش.
    await this.queueForTax(companyId, sale.id);

    return sale;
  }

  /**
   * افزودن خودکار فاکتور به صف مالیاتی.
   *
   * **بیرون از تراکنش** و با خطای بلعیده‌شده، عمداً:
   *
   * ارسال مالیاتی یک کار جانبی است.  اگر داخل تراکنش بود، یک تنظیم ناقص
   * مالیاتی کل فروش را برمی‌گرداند — یعنی صندوق فروشگاه به‌خاطر سامانهٔ
   * سازمان می‌خوابید.  فاکتور ثبت می‌شود؛ اگر صف نگرفت، در صفحهٔ مؤدیان
   * زیر «در صف نیست» دیده می‌شود و دستی افزوده می‌شود.
   */
  private async queueForTax(companyId: string, saleId: string) {
    if (!this.tax) return;

    try {
      await this.tax.enqueue(companyId, saleId);
    } catch {
      // شمارشش در `notQueued` می‌آید؛ همان‌جا دیده و رفع می‌شود.
    }
  }

  /** لغو فاکتور و برگرداندن موجودی */
  async cancel(id: string, companyId: string) {
    return this.db.transaction(async (tx) => {
      const sales = await tx.query<Sale & { warehouseId: string }>(
        'SELECT * FROM "Sale" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [id, companyId],
      );
      const sale = sales.rows[0];
      if (!sale) throw new NotFoundException('فاکتور فروش یافت نشد');
      if (sale.status === 'CANCELLED') {
        throw new BadRequestException('فاکتور قبلاً لغو شده است');
      }

      const items = await tx.query<SaleItem>(
        'SELECT * FROM "SaleItem" WHERE "saleId" = $1',
        [id],
      );

      // برگرداندن موجودی
      for (const item of items.rows) {
        await applyStockDelta(
          tx,
          sale.warehouseId,
          item.productId,
          Number(item.quantity),
          { companyId, reason: 'SALE_CANCEL', refType: 'SALE', refId: id },
        );
      }

      // اعتبار کالابرگ به خانوار برمی‌گردد، وگرنه سهمیه سوخت می‌شود.
      await this.ration?.reverseIn(tx, companyId, id);

      // پول نقد به مشتری پس داده می‌شود، پس باید از صندوق هم کم شود؛ در غیر
      // این صورت موجودی سیستمی صندوق از پول واقعی بیشتر می‌ماند و در پایان
      // شیفت به‌شکل کسری کاذب ظاهر می‌شود.
      const payments = await tx.query<{ id: string; cashBoxId: string | null; amount: string }>(
        `SELECT id, "cashBoxId", amount FROM "Payment"
         WHERE "saleId" = $1 AND status = 'COMPLETED'`,
        [id],
      );

      for (const payment of payments.rows) {
        if (payment.cashBoxId) {
          await tx.query(
            'UPDATE "CashBox" SET balance = balance - $1, "updatedAt" = now() WHERE id = $2',
            [payment.amount, payment.cashBoxId],
          );
        }
      }

      // پرداخت‌ها باطل می‌شوند تا در گزارش شیفت و صورت‌های مالی دوباره
      // شمرده نشوند.
      await tx.query(
        `UPDATE "Payment" SET status = 'REFUNDED', "updatedAt" = now()
         WHERE "saleId" = $1 AND status = 'COMPLETED'`,
        [id],
      );

      // اسناد حسابداری فاکتور با سند معکوس خنثی می‌شوند؛ سند قطعی هرگز حذف
      // نمی‌شود تا رد حسابرسی بماند.
      await this.posting.reverseBySourceIn(tx, companyId, 'Sale', id);
      await this.posting.reverseBySourceIn(tx, companyId, 'SaleCogs', id);

      const updated = await tx.query<Sale>(
        `UPDATE "Sale" SET status = 'CANCELLED', "updatedAt" = now() WHERE id = $1 RETURNING *`,
        [id],
      );
      return updated.rows[0];
    });
  }

  /** فاکتور چاپی HTML (راست‌به‌چپ) */
  async printInvoice(id: string, companyId: string) {
    const sale = await this.findOne(id, companyId);

    // سربرگ شرکت.  بدون آن، فاکتوری که به دست مشتری می‌رسد معلوم نیست از
    // کدام فروشگاه است — و برای اظهار مالیاتی هم بی‌اعتبار است.
    const [company] = await this.db.query<{
      name: string;
      legalName: string | null;
      address: string | null;
      phone: string | null;
      taxNumber: string | null;
    }>(
      `SELECT name, "legalName", address, phone, "taxNumber"
         FROM "Company" WHERE id = $1`,
      [companyId],
    );

    const customer = sale.customer as Record<string, string> | null;
    const customerName = escapeHtml(
      customer ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : 'مشتری نقدی',
    );

    const rows = (sale.items as Array<Record<string, unknown>>)
      .map(
        (item, index) =>
          `<tr><td>${index + 1}</td><td>${escapeHtml(item.productName ?? '-')}</td><td>${Number(
            item.quantity ?? 0,
          )}</td><td>${Number(item.price ?? 0).toLocaleString(
            'fa-IR',
          )}</td><td>${Number(item.total ?? 0).toLocaleString('fa-IR')}</td></tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8" />
<title>فاکتور ${sale.invoiceNo}</title>
<style>
  body { font-family: Tahoma, 'Vazirmatn', sans-serif; margin: 24px; color: #222; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #999; padding: 8px; text-align: center; }
  th { background: #f0f0f0; }
  .brand { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
  .brand h1 { margin: 0 0 4px; font-size: 20px; }
  .brand div { font-size: 12px; color: #444; }
  .totals { margin-top: 16px; width: 300px; margin-right: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-weight: bold; border-top: 1px solid #333; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="brand">
    <h1>${escapeHtml(company?.legalName || company?.name || '')}</h1>
    ${[company?.address, company?.phone]
      .filter(Boolean)
      .map((line) => `<div>${escapeHtml(String(line))}</div>`)
      .join('')}
    ${company?.taxNumber
      ? `<div>شناسهٔ مالیاتی: ${escapeHtml(company.taxNumber)}</div>`
      : ''}
  </div>
  <div class="header">
    <div>
      <h2>فاکتور فروش</h2>
      <div>شماره: ${sale.invoiceNo}</div>
      <div>تاریخ: ${new Date(sale.createdAt as string).toLocaleDateString('fa-IR')}</div>
    </div>
    <div>
      <div>مشتری: ${customerName}</div>
      <div>وضعیت: ${sale.status}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>جمع کل:</span><span>${Number(sale.subtotal).toLocaleString('fa-IR')}</span></div>
    <div><span>تخفیف:</span><span>${Number(sale.discount).toLocaleString('fa-IR')}</span></div>
    <div><span>مالیات:</span><span>${Number(sale.tax).toLocaleString('fa-IR')}</span></div>
    <div class="grand"><span>مبلغ نهایی:</span><span>${Number(sale.total).toLocaleString('fa-IR')}</span></div>
  </div>
  <button class="no-print" onclick="window.print()">چاپ</button>
</body>
</html>`;
  }

  /** تعریف اقساط برای مانده فاکتور */
  async createInstallments(
    id: string,
    companyId: string,
    options: { count: number; intervalDays?: number; startDate?: string },
  ) {
    const count = Math.floor(options?.count ?? 0);
    if (!count || count < 2 || count > 60) {
      throw new BadRequestException('تعداد اقساط باید بین ۲ تا ۶۰ باشد');
    }

    const sale = await this.findOne(id, companyId);
    if (['CANCELLED', 'RETURNED'].includes(sale.status)) {
      throw new BadRequestException('برای فاکتور لغوشده نمی‌توان قسط تعریف کرد');
    }

    const existing = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "Installment" WHERE "saleId" = $1',
      [sale.id],
    );
    if (Number(existing[0]?.count ?? 0) > 0) {
      throw new BadRequestException('برای این فاکتور قبلاً اقساط تعریف شده است');
    }

    const paid = (sale.payments as Array<Record<string, unknown>>)
      .filter((payment) => payment.status === 'COMPLETED')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const remaining = Number(sale.total) - paid;
    if (remaining <= 0) {
      throw new BadRequestException('این فاکتور مانده‌ای برای تقسیط ندارد');
    }

    const intervalDays =
      options?.intervalDays && options.intervalDays > 0
        ? options.intervalDays
        : DEFAULT_INSTALLMENT_INTERVAL_DAYS;
    const start = options?.startDate ? new Date(options.startDate) : new Date();
    const base = Math.floor((remaining / count) * 100) / 100;

    await this.db.transaction(async (tx) => {
      for (let index = 0; index < count; index += 1) {
        const dueDate = new Date(start);
        dueDate.setDate(dueDate.getDate() + index * intervalDays);
        const amount =
          index === count - 1
            ? Math.round((remaining - base * (count - 1)) * 100) / 100
            : base;

        await tx.query(
          `INSERT INTO "Installment" (id, "saleId", seq, "dueDate", amount, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [randomUUID(), sale.id, index + 1, dueDate, amount],
        );
      }
    });

    return this.listInstallments(id, companyId);
  }

  async listInstallments(id: string, companyId: string) {
    const sale = await this.findOne(id, companyId);
    return this.db.query(
      'SELECT * FROM "Installment" WHERE "saleId" = $1 ORDER BY seq ASC',
      [sale.id],
    );
  }

  async payInstallment(installmentId: string, companyId: string, cashBoxId?: string) {
    return this.db.transaction(async (tx) => {
      const installments = await tx.query<{
        id: string;
        saleId: string;
        amount: string;
        status: string;
        saleTotal: string;
      }>(
        `SELECT i.id, i."saleId", i.amount, i.status, s.total AS "saleTotal"
         FROM "Installment" i JOIN "Sale" s ON s.id = i."saleId"
         WHERE i.id = $1 AND s."companyId" = $2 FOR UPDATE OF i`,
        [installmentId, companyId],
      );
      const installment = installments.rows[0];
      if (!installment) throw new NotFoundException('قسط یافت نشد');
      if (installment.status === 'PAID') {
        throw new BadRequestException('این قسط قبلاً پرداخت شده است');
      }

      const updated = await tx.query(
        `UPDATE "Installment" SET status = 'PAID', "paidAt" = now(), "updatedAt" = now()
         WHERE id = $1 RETURNING *`,
        [installmentId],
      );

      if (cashBoxId) {
        const cashBoxes = await tx.query<{ id: string }>(
          'SELECT id FROM "CashBox" WHERE id = $1 AND "companyId" = $2',
          [cashBoxId, companyId],
        );
        if (!cashBoxes.rows[0]) throw new NotFoundException('صندوق یافت نشد');

        await tx.query(
          `INSERT INTO "Payment" (id, "saleId", "cashBoxId", amount, method, status)
           VALUES ($1, $2, $3, $4, 'CASH', 'COMPLETED')`,
          [randomUUID(), installment.saleId, cashBoxId, installment.amount],
        );
        await tx.query(
          'UPDATE "CashBox" SET balance = balance + $1, "updatedAt" = now() WHERE id = $2',
          [installment.amount, cashBoxId],
        );

        const paid = await tx.query<{ sum: string }>(
          `SELECT COALESCE(sum(amount), 0)::text AS sum FROM "Payment"
           WHERE "saleId" = $1 AND status = 'COMPLETED'`,
          [installment.saleId],
        );
        await tx.query('UPDATE "Sale" SET status = $1, "updatedAt" = now() WHERE id = $2', [
          Number(paid.rows[0]?.sum ?? 0) >= Number(installment.saleTotal) ? 'PAID' : 'PARTIAL',
          installment.saleId,
        ]);

        // سند وصول — تا امروز زده نمی‌شد.
        //
        // صندوق بالا می‌رفت و فاکتور تسویه می‌شد، ولی دفتر کل خبر
        // نداشت: موجودی صندوق در گزارش با مانده‌اش در دفتر برای همیشه
        // اختلاف پیدا می‌کرد و هیچ‌کس نمی‌فهمید از کجا.
        //
        // داخل همان تراکنش: اگر سند نخورد، وصول هم ثبت نمی‌شود.
        await this.posting.postAuto(tx, companyId, {
          sourceType: 'Installment',
          sourceId: installment.id,
          description: `وصول قسط فاکتور ${installment.saleId}`,
          lines: collectionEntry({
            amount: Number(installment.amount),
            method: 'CASH',
            description: 'وصول قسط',
          }),
        });
      }

      return updated.rows[0];
    });
  }
}
