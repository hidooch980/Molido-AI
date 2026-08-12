import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { parseScaleBarcode, ScaleBarcodeMode } from './barcode';

type ProductRow = Record<string, unknown> & {
  id: string;
  name: string;
  sku: string;
  unit: string;
  salePrice: string;
  isWeighed: boolean;
  taxRate: string | null;
};

export type ScanResult = {
  product: ProductRow;
  /** مقدار: تعداد برای کالای شمارشی، کیلوگرم برای کالای وزنی */
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** موجودی انبار در لحظهٔ اسکن، اگر انبار مشخص شده باشد */
  available: number | null;
  source: 'BARCODE' | 'SCALE' | 'SKU';
};

const PRODUCT_COLUMNS = `
  p.id, p.name, p.sku, p.unit, p."salePrice", p."taxRate",
  p."isWeighed", p."scaleCode", p.barcode, p."trackInventory"
`;

/**
 * تبدیل یک اسکن به یک سطر فاکتور.
 *
 * سه حالت پشتیبانی می‌شود و ترتیبش مهم است:
 *   ۱. بارکد ترازو (کالای وزنی) — مقدار داخل خود بارکد است
 *   ۲. بارکد معمولی کالا
 *   ۳. SKU (وقتی بارکد پاک شده یا کالا بارکد ندارد)
 */
@Injectable()
export class ScanService {
  constructor(private readonly db: DatabaseService) {}

  private async scaleConfig(companyId: string): Promise<{
    prefix: string;
    mode: ScaleBarcodeMode;
  }> {
    const rows = await this.db.query<{
      scaleBarcodePrefix: string;
      scaleBarcodeMode: ScaleBarcodeMode;
    }>('SELECT "scaleBarcodePrefix", "scaleBarcodeMode" FROM "Company" WHERE id = $1', [
      companyId,
    ]);
    return {
      prefix: rows[0]?.scaleBarcodePrefix ?? '2',
      mode: rows[0]?.scaleBarcodeMode ?? 'WEIGHT',
    };
  }

  private async stockOf(productId: string, warehouseId?: string): Promise<number | null> {
    if (!warehouseId) return null;
    const rows = await this.db.query<{ quantity: string }>(
      'SELECT quantity FROM "Inventory" WHERE "productId" = $1 AND "warehouseId" = $2',
      [productId, warehouseId],
    );
    return rows[0] ? Number(rows[0].quantity) : 0;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  async scan(
    companyId: string,
    code: string,
    options?: { warehouseId?: string },
  ): Promise<ScanResult> {
    const input = (code ?? '').trim();
    if (!input) throw new NotFoundException('کدی برای جستجو ارسال نشده است');

    const config = await this.scaleConfig(companyId);
    const scale = parseScaleBarcode(input, config.prefix, config.mode);

    // ۱ — برچسب ترازو
    if (scale) {
      const rows = await this.db.query<ProductRow>(
        `SELECT ${PRODUCT_COLUMNS} FROM "Product" p
         WHERE p."companyId" = $1 AND p."scaleCode" = $2`,
        [companyId, scale.scaleCode],
      );
      const product = rows[0];
      if (!product) {
        throw new NotFoundException(`کالای ترازو با کد ${scale.scaleCode} یافت نشد`);
      }

      const unitPrice = Number(product.salePrice);
      // در حالت مبلغی، ترازو خودش قیمت را حساب کرده؛ وزن را از آن استخراج
      // می‌کنیم تا کسر موجودی درست بماند.
      const quantity =
        scale.mode === 'WEIGHT'
          ? scale.value
          : unitPrice > 0
            ? this.round(scale.value / unitPrice)
            : 0;
      const lineTotal =
        scale.mode === 'PRICE' ? scale.value : this.round(quantity * unitPrice);

      return {
        product,
        quantity,
        unitPrice,
        lineTotal,
        available: await this.stockOf(product.id, options?.warehouseId),
        source: 'SCALE',
      };
    }

    // ۲ و ۳ — بارکد کالا، سپس SKU
    const rows = await this.db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM "Product" p
       WHERE p."companyId" = $1 AND (p.barcode = $2 OR p.sku = $2)
       ORDER BY (p.barcode = $2) DESC LIMIT 1`,
      [companyId, input],
    );
    const product = rows[0];
    if (!product) throw new NotFoundException(`کالایی با کد «${input}» یافت نشد`);

    const unitPrice = Number(product.salePrice);
    return {
      product,
      quantity: 1,
      unitPrice,
      lineTotal: unitPrice,
      available: await this.stockOf(product.id, options?.warehouseId),
      source: (product.barcode as string) === input ? 'BARCODE' : 'SKU',
    };
  }

  /**
   * جستجوی متنی سریع برای وقتی کالا بارکد ندارد یا بارکد خوانده نمی‌شود —
   * صندوق‌دار باید بتواند با نام هم پیدا کند.
   */
  async search(companyId: string, term: string, limit = 20) {
    const query = (term ?? '').trim();
    if (!query) return [];

    return this.db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM "Product" p
       WHERE p."companyId" = $1 AND p.status = 'ACTIVE'
         AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR p.barcode ILIKE $2)
       ORDER BY p.name ASC LIMIT $3`,
      [companyId, `%${query}%`, Math.min(limit, 50)],
    );
  }
}
