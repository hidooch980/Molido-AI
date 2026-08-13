import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { DatabaseService } from '../database/database.service';

/**
 * فروشگاه اینترنتی.
 *
 * تفاوت بنیادی با بقیهٔ سامانه: کاربرش **مشتری** است نه کارمند.
 *
 * تصمیم اصلی: **زنجیرهٔ فروش موجود بازنویسی نمی‌شود.**  سفارش آنلاین پس از
 * تأیید به همان `SalesOrder` تبدیل می‌شود و از آنجا ارسال و فاکتور و سند
 * حسابداری مثل هر سفارش دیگری جلو می‌رود.  مسیر جدا یعنی دو سیستم فروش
 * موازی که دیر یا زود از هم واگرا می‌شوند.
 *
 * سه محافظ که تجربهٔ خرید را درست نگه می‌دارند:
 *
 * ۱. **قیمت در تسویه دوباره از دیتابیس خوانده می‌شود.**  قیمتِ سبد فقط
 *    برای نمایش است؛ اگر مبنا قرار گیرد، هر کسی می‌تواند با دستکاری
 *    درخواست، کالا را به قیمت دلخواه بخرد.
 *
 * ۲. **موجودی در لحظهٔ ثبت سفارش بررسی می‌شود**، نه در لحظهٔ افزودن به سبد.
 *    بین این دو ممکن است ساعت‌ها فاصله باشد.
 *
 * ۳. **موجودی هنگام تأیید کسر می‌شود، نه ثبت سفارش.**  سفارش پرداخت‌نشده
 *    نباید کالا را از دسترس مشتری‌های دیگر خارج کند.
 */

type Row = Record<string, unknown>;

@Injectable()
export class ShopService {
  constructor(private readonly db: DatabaseService) {}

  // ---------------------------------------------------------- فروشگاه

  async settings(companyId: string) {
    const rows = await this.db.query<Row>(
      'SELECT * FROM "ShopSetting" WHERE "companyId" = $1',
      [companyId],
    );

    // پیش‌فرض معقول تا مدیر تنظیمات را پر کند؛ فروشگاه نباید به‌خاطر
    // نبودِ یک ردیف تنظیمات، خالی به مشتری نشان داده شود.
    return (
      rows[0] ?? {
        companyId,
        shopName: null,
        isOpen: true,
        shippingFee: 0,
        freeShippingOver: null,
        minOrderAmount: 0,
      }
    );
  }

  async saveSettings(companyId: string, dto: Record<string, unknown>) {
    const rows = await this.db.query<Row>(
      `INSERT INTO "ShopSetting"
         ("companyId", "shopName", "shopDescription", "isOpen", "shippingFee",
          "freeShippingOver", "minOrderAmount", "warehouseId", "supportPhone")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT ("companyId") DO UPDATE
         SET "shopName" = EXCLUDED."shopName",
             "shopDescription" = EXCLUDED."shopDescription",
             "isOpen" = EXCLUDED."isOpen",
             "shippingFee" = EXCLUDED."shippingFee",
             "freeShippingOver" = EXCLUDED."freeShippingOver",
             "minOrderAmount" = EXCLUDED."minOrderAmount",
             "warehouseId" = EXCLUDED."warehouseId",
             "supportPhone" = EXCLUDED."supportPhone",
             "updatedAt" = now()
       RETURNING *`,
      [
        companyId,
        dto.shopName ?? null,
        dto.shopDescription ?? null,
        dto.isOpen ?? true,
        dto.shippingFee ?? 0,
        dto.freeShippingOver ?? null,
        dto.minOrderAmount ?? 0,
        dto.warehouseId ?? null,
        dto.supportPhone ?? null,
      ],
    );

    return rows[0];
  }

  // ----------------------------------------------------------- کاتالوگ

  /** کالاهای قابل فروش آنلاین — عمومی، بدون نیاز به ورود. */
  async catalogue(
    companyId: string,
    options: { search?: string; categoryId?: string; limit?: number } = {},
  ) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (options.search) {
      values.push(`%${options.search}%`);
      filter += ` AND (p.name ILIKE $${values.length} OR p.sku ILIKE $${values.length})`;
    }
    if (options.categoryId) {
      values.push(options.categoryId);
      filter += ` AND p."categoryId" = $${values.length}`;
    }

    values.push(Math.min(options.limit ?? 60, 200));

    return this.db.query<Row>(
      `SELECT p.id, p.name, p.sku, p.unit, p.description, p."imageUrl",
              COALESCE(p."onlinePrice", p."salePrice") AS price,
              c.name AS "categoryName",
              -- موجودی جمعِ همهٔ انبارها؛ مشتری فقط باید بداند هست یا نه.
              COALESCE((SELECT SUM(i.quantity) FROM "Inventory" i
                         WHERE i."productId" = p.id), 0) AS stock
         FROM "Product" p
         LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."companyId" = $1 AND p."isOnline" = true${filter}
        ORDER BY p.name
        LIMIT $${values.length}`,
      values,
    );
  }

  async categories(companyId: string) {
    return this.db.query<Row>(
      `SELECT c.id, c.name,
              (SELECT COUNT(*) FROM "Product" p
                WHERE p."categoryId" = c.id AND p."isOnline" = true) AS "productCount"
         FROM "Category" c
        WHERE c."companyId" = $1
        ORDER BY c.name`,
      [companyId],
    );
  }

  async product(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `SELECT p.id, p.name, p.sku, p.unit, p.description, p."imageUrl",
              COALESCE(p."onlinePrice", p."salePrice") AS price,
              c.name AS "categoryName",
              COALESCE((SELECT SUM(i.quantity) FROM "Inventory" i
                         WHERE i."productId" = p.id), 0) AS stock
         FROM "Product" p
         LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE p.id = $1 AND p."companyId" = $2 AND p."isOnline" = true`,
      [id, companyId],
    );

    if (!rows[0]) throw new NotFoundException('کالا یافت نشد');
    return rows[0];
  }

  // -------------------------------------------------------- حساب مشتری

  async register(
    companyId: string,
    dto: { phone: string; password: string; firstName: string; lastName?: string },
  ) {
    const phone = String(dto.phone ?? '').trim();
    const password = String(dto.password ?? '');

    if (!/^09\d{9}$/.test(phone)) {
      throw new BadRequestException('شمارهٔ موبایل معتبر نیست');
    }
    if (password.length < 6) {
      throw new BadRequestException('رمز عبور باید حداقل ۶ نویسه باشد');
    }
    if (!String(dto.firstName ?? '').trim()) {
      throw new BadRequestException('نام لازم است');
    }

    const hash = await bcrypt.hash(password, 10);

    return this.db.transaction(async (tx) => {
      const existing = await tx.query<{ id: string; passwordHash: string | null }>(
        'SELECT id, "passwordHash" FROM "Customer" WHERE "companyId" = $1 AND phone = $2',
        [companyId, phone],
      );

      // مشتریِ حضوریِ موجود، حساب آنلاین می‌گیرد — رکورد تازه ساخته
      // نمی‌شود تا تاریخچهٔ خریدش یکی بماند.
      if (existing.rows[0]) {
        if (existing.rows[0].passwordHash) {
          throw new BadRequestException('این شماره قبلاً ثبت‌نام کرده است');
        }

        const updated = await tx.query<Row>(
          `UPDATE "Customer" SET "passwordHash" = $1, "updatedAt" = now()
            WHERE id = $2 RETURNING id, "firstName", "lastName", phone`,
          [hash, existing.rows[0].id],
        );
        return updated.rows[0];
      }

      const created = await tx.query<Row>(
        `INSERT INTO "Customer"
           (id, "companyId", "firstName", "lastName", phone, "passwordHash", "isActive")
         VALUES ($1,$2,$3,$4,$5,$6,true)
         RETURNING id, "firstName", "lastName", phone`,
        [
          randomUUID(),
          companyId,
          String(dto.firstName).trim(),
          String(dto.lastName ?? '').trim() || '—',
          phone,
          hash,
        ],
      );

      return created.rows[0];
    });
  }

  async login(companyId: string, dto: { phone: string; password: string }) {
    const rows = await this.db.query<{
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      passwordHash: string | null;
      isActive: boolean;
    }>(
      'SELECT * FROM "Customer" WHERE "companyId" = $1 AND phone = $2',
      [companyId, String(dto.phone ?? '').trim()],
    );

    const customer = rows[0];

    // پیام یکسان برای «شماره نیست» و «رمز غلط»: تفاوتشان به مهاجم می‌گوید
    // کدام شماره‌ها در سامانه ثبت‌اند.
    const invalid = new UnauthorizedException('شماره یا رمز عبور نادرست است');

    if (!customer?.passwordHash) throw invalid;
    if (!customer.isActive) throw invalid;

    const ok = await bcrypt.compare(String(dto.password ?? ''), customer.passwordHash);
    if (!ok) throw invalid;

    await this.db.query(
      'UPDATE "Customer" SET "lastLoginAt" = now() WHERE id = $1',
      [customer.id],
    );

    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
    };
  }

  // ------------------------------------------------------------- سبد

  /** سبد فعال را پیدا یا می‌سازد. */
  private async activeCart(
    companyId: string,
    owner: { customerId?: string | null; guestToken?: string | null },
  ) {
    const column = owner.customerId ? 'customerId' : 'guestToken';
    const value = owner.customerId ?? owner.guestToken;

    if (!value) throw new BadRequestException('شناسهٔ سبد لازم است');

    const found = await this.db.query<{ id: string }>(
      `SELECT id FROM "Cart"
        WHERE "companyId" = $1 AND "${column}" = $2 AND status = 'ACTIVE'`,
      [companyId, value],
    );

    if (found[0]) return found[0].id;

    const created = await this.db.query<{ id: string }>(
      `INSERT INTO "Cart" (id, "companyId", "customerId", "guestToken", status)
       VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING id`,
      [
        randomUUID(),
        companyId,
        owner.customerId ?? null,
        owner.guestToken ?? null,
      ],
    );

    return created[0].id;
  }

  async cart(
    companyId: string,
    owner: { customerId?: string | null; guestToken?: string | null },
  ) {
    const cartId = await this.activeCart(companyId, owner);

    const items = await this.db.query<Row>(
      `SELECT ci.id, ci."productId", ci.qty, ci."priceAtAdd",
              p.name, p.unit, p."imageUrl",
              COALESCE(p."onlinePrice", p."salePrice") AS price,
              COALESCE((SELECT SUM(i.quantity) FROM "Inventory" i
                         WHERE i."productId" = p.id), 0) AS stock
         FROM "CartItem" ci
         JOIN "Product" p ON p.id = ci."productId"
        WHERE ci."cartId" = $1
        ORDER BY ci."createdAt"`,
      [cartId],
    );

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty),
      0,
    );

    return { cartId, items, subtotal };
  }

  async addToCart(
    companyId: string,
    owner: { customerId?: string | null; guestToken?: string | null },
    dto: { productId: string; qty?: number },
  ) {
    const qty = Number(dto.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException('تعداد نامعتبر است');
    }

    const products = await this.db.query<{ price: string }>(
      `SELECT COALESCE("onlinePrice", "salePrice") AS price FROM "Product"
        WHERE id = $1 AND "companyId" = $2 AND "isOnline" = true`,
      [dto.productId, companyId],
    );

    if (!products[0]) throw new NotFoundException('کالا در فروشگاه موجود نیست');

    const cartId = await this.activeCart(companyId, owner);

    await this.db.query(
      `INSERT INTO "CartItem" (id, "cartId", "productId", qty, "priceAtAdd")
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("cartId", "productId") DO UPDATE
         SET qty = "CartItem".qty + EXCLUDED.qty`,
      [randomUUID(), cartId, dto.productId, qty, products[0].price],
    );

    return this.cart(companyId, owner);
  }

  async setCartQty(
    companyId: string,
    owner: { customerId?: string | null; guestToken?: string | null },
    itemId: string,
    qty: number,
  ) {
    const cartId = await this.activeCart(companyId, owner);

    if (Number(qty) <= 0) {
      await this.db.query(
        'DELETE FROM "CartItem" WHERE id = $1 AND "cartId" = $2',
        [itemId, cartId],
      );
    } else {
      await this.db.query(
        'UPDATE "CartItem" SET qty = $1 WHERE id = $2 AND "cartId" = $3',
        [qty, itemId, cartId],
      );
    }

    return this.cart(companyId, owner);
  }

  // ---------------------------------------------------------- تسویه

  private async nextOrderNo(companyId: string) {
    const rows = await this.db.query<{ n: string | null }>(
      `SELECT MAX(NULLIF(regexp_replace("orderNo", '\\D', '', 'g'), '')::bigint) AS n
         FROM "OnlineOrder" WHERE "companyId" = $1`,
      [companyId],
    );
    return `WEB-${String(Number(rows[0]?.n ?? 0) + 1).padStart(6, '0')}`;
  }

  /**
   * ثبت سفارش.
   *
   * قیمت **دوباره از دیتابیس** خوانده می‌شود، نه از سبد: قیمتِ سبد فقط
   * برای نمایش است و اگر مبنا قرار گیرد، هر کسی می‌تواند با دستکاری
   * درخواست کالا را به قیمت دلخواه بخرد.
   */
  async checkout(
    companyId: string,
    customerId: string,
    dto: {
      addressId?: string;
      shipAddress?: string;
      receiverName?: string;
      receiverPhone?: string;
      paymentMethod?: string;
      note?: string;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const settings = await tx.query<{
        isOpen: boolean;
        shippingFee: string;
        freeShippingOver: string | null;
        minOrderAmount: string;
      }>('SELECT * FROM "ShopSetting" WHERE "companyId" = $1', [companyId]);

      const shop = settings.rows[0];
      if (shop && !shop.isOpen) {
        throw new BadRequestException('فروشگاه در حال حاضر بسته است');
      }

      const carts = await tx.query<{ id: string }>(
        `SELECT id FROM "Cart"
          WHERE "companyId" = $1 AND "customerId" = $2 AND status = 'ACTIVE'
          FOR UPDATE`,
        [companyId, customerId],
      );

      const cartId = carts.rows[0]?.id;
      if (!cartId) throw new BadRequestException('سبد خرید خالی است');

      const items = await tx.query<{
        productId: string;
        qty: string;
        name: string;
        price: string;
        stock: string;
      }>(
        `SELECT ci."productId", ci.qty, p.name,
                COALESCE(p."onlinePrice", p."salePrice") AS price,
                COALESCE((SELECT SUM(i.quantity) FROM "Inventory" i
                           WHERE i."productId" = p.id), 0) AS stock
           FROM "CartItem" ci
           JOIN "Product" p ON p.id = ci."productId"
          WHERE ci."cartId" = $1`,
        [cartId],
      );

      if (!items.rows.length) throw new BadRequestException('سبد خرید خالی است');

      // موجودی در لحظهٔ ثبت سفارش بررسی می‌شود، نه افزودن به سبد: بین آن
      // دو ممکن است ساعت‌ها فاصله باشد.
      for (const item of items.rows) {
        if (Number(item.stock) < Number(item.qty)) {
          throw new BadRequestException(
            `موجودی «${item.name}» کافی نیست (موجود: ${item.stock})`,
          );
        }
      }

      const subtotal = items.rows.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.qty),
        0,
      );

      const minimum = Number(shop?.minOrderAmount ?? 0);
      if (minimum > 0 && subtotal < minimum) {
        throw new BadRequestException(
          `حداقل مبلغ سفارش ${minimum.toLocaleString('fa-IR')} است`,
        );
      }

      const baseFee = Number(shop?.shippingFee ?? 0);
      const freeOver = shop?.freeShippingOver
        ? Number(shop.freeShippingOver)
        : null;
      const shippingFee = freeOver !== null && subtotal >= freeOver ? 0 : baseFee;

      const total = subtotal + shippingFee;
      const orderId = randomUUID();
      const orderNo = await this.nextOrderNo(companyId);

      await tx.query(
        `INSERT INTO "OnlineOrder"
           (id, "companyId", "orderNo", "customerId", "addressId", "shipAddress",
            "receiverName", "receiverPhone", subtotal, "shippingFee", total,
            "paymentMethod", "paymentStatus", status, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDING','PLACED',$13)`,
        [
          orderId,
          companyId,
          orderNo,
          customerId,
          dto.addressId ?? null,
          dto.shipAddress ?? null,
          dto.receiverName ?? null,
          dto.receiverPhone ?? null,
          subtotal,
          shippingFee,
          total,
          dto.paymentMethod ?? 'COD',
          dto.note ?? null,
        ],
      );

      for (const item of items.rows) {
        await tx.query(
          `INSERT INTO "OnlineOrderItem"
             (id, "orderId", "productId", name, qty, "unitPrice", total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            randomUUID(),
            orderId,
            item.productId,
            item.name,
            item.qty,
            item.price,
            Number(item.price) * Number(item.qty),
          ],
        );
      }

      await tx.query(
        `UPDATE "Cart" SET status = 'ORDERED', "updatedAt" = now() WHERE id = $1`,
        [cartId],
      );

      return { id: orderId, orderNo, subtotal, shippingFee, total };
    });
  }

  async myOrders(companyId: string, customerId: string) {
    return this.db.query<Row>(
      `SELECT o.*,
              (SELECT COUNT(*) FROM "OnlineOrderItem" i WHERE i."orderId" = o.id)
                AS "itemCount"
         FROM "OnlineOrder" o
        WHERE o."companyId" = $1 AND o."customerId" = $2
        ORDER BY o."placedAt" DESC
        LIMIT 100`,
      [companyId, customerId],
    );
  }

  async orderDetail(companyId: string, orderId: string, customerId?: string) {
    const values: unknown[] = [orderId, companyId];
    let guard = '';

    // مشتری فقط سفارش خودش را می‌بیند؛ کارمند همه را.
    if (customerId) {
      values.push(customerId);
      guard = ` AND "customerId" = $${values.length}`;
    }

    const rows = await this.db.query<Row>(
      `SELECT * FROM "OnlineOrder" WHERE id = $1 AND "companyId" = $2${guard}`,
      values,
    );

    if (!rows[0]) throw new NotFoundException('سفارش یافت نشد');

    const items = await this.db.query<Row>(
      'SELECT * FROM "OnlineOrderItem" WHERE "orderId" = $1',
      [orderId],
    );

    return { ...rows[0], items };
  }

  // -------------------------------------------------- مدیریت سفارش‌ها

  async orders(companyId: string, status?: string) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (status) {
      values.push(status);
      filter = ` AND o.status = $${values.length}`;
    }

    return this.db.query<Row>(
      `SELECT o.*,
              TRIM(COALESCE(c."firstName",'') || ' ' || COALESCE(c."lastName",''))
                AS "customerName",
              (SELECT COUNT(*) FROM "OnlineOrderItem" i WHERE i."orderId" = o.id)
                AS "itemCount"
         FROM "OnlineOrder" o
         LEFT JOIN "Customer" c ON c.id = o."customerId"
        WHERE o."companyId" = $1${filter}
        ORDER BY o."placedAt" DESC
        LIMIT 200`,
      values,
    );
  }

  /**
   * تأیید سفارش ⇒ ساخت سفارش فروش.
   *
   * از اینجا به بعد، سفارش آنلاین دقیقاً مثل هر سفارش دیگری در زنجیرهٔ
   * موجود جلو می‌رود: ارسال، فاکتور، کسر موجودی و سند حسابداری.
   */
  async confirm(companyId: string, orderId: string) {
    return this.db.transaction(async (tx) => {
      const orders = await tx.query<{
        id: string;
        orderNo: string;
        customerId: string | null;
        status: string;
        shippingFee: string;
      }>(
        'SELECT * FROM "OnlineOrder" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [orderId, companyId],
      );

      const order = orders.rows[0];
      if (!order) throw new NotFoundException('سفارش یافت نشد');
      if (order.status !== 'PLACED') {
        throw new BadRequestException(
          `سفارش در وضعیت «${order.status}» قابل تأیید نیست`,
        );
      }

      const settings = await tx.query<{ warehouseId: string | null }>(
        'SELECT "warehouseId" FROM "ShopSetting" WHERE "companyId" = $1',
        [companyId],
      );

      const warehouseId = settings.rows[0]?.warehouseId;
      if (!warehouseId) {
        throw new BadRequestException(
          'انبار فروشگاه اینترنتی تنظیم نشده است',
        );
      }

      const items = await tx.query<{
        productId: string | null;
        name: string;
        qty: string;
        unitPrice: string;
      }>('SELECT * FROM "OnlineOrderItem" WHERE "orderId" = $1', [orderId]);

      const salesOrderId = randomUUID();

      const nextNo = await tx.query<{ n: string | null }>(
        `SELECT MAX(NULLIF(regexp_replace("orderNo", '\\D', '', 'g'), '')::bigint) AS n
           FROM "SalesOrder" WHERE "companyId" = $1`,
        [companyId],
      );
      const soNo = `SO-${String(Number(nextNo.rows[0]?.n ?? 0) + 1).padStart(5, '0')}`;

      const subtotal = items.rows.reduce(
        (sum, item) => sum + Number(item.unitPrice) * Number(item.qty),
        0,
      );

      await tx.query(
        `INSERT INTO "SalesOrder"
           (id, "companyId", "orderNo", "customerId", "warehouseId", status,
            "totalAmount", discount, tax, note)
         VALUES ($1,$2,$3,$4,$5,'CONFIRMED',$6,0,0,$7)`,
        [
          salesOrderId,
          companyId,
          soNo,
          order.customerId,
          warehouseId,
          subtotal,
          `سفارش اینترنتی ${order.orderNo}`,
        ],
      );

      for (const item of items.rows) {
        await tx.query(
          `INSERT INTO "SalesOrderItem"
             (id, "orderId", "productId", name, qty, "unitPrice", total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            randomUUID(),
            salesOrderId,
            item.productId,
            item.name,
            item.qty,
            item.unitPrice,
            Number(item.unitPrice) * Number(item.qty),
          ],
        );
      }

      await tx.query(
        `UPDATE "OnlineOrder"
            SET status = 'CONFIRMED', "confirmedAt" = now(),
                "salesOrderId" = $1, "updatedAt" = now()
          WHERE id = $2`,
        [salesOrderId, orderId],
      );

      return { orderNo: order.orderNo, salesOrderId, salesOrderNo: soNo };
    });
  }

  async setStatus(companyId: string, orderId: string, status: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "OnlineOrder"
          SET status = $1,
              "cancelledAt" = CASE WHEN $1 = 'CANCELLED' THEN now() ELSE "cancelledAt" END,
              "updatedAt" = now()
        WHERE id = $2 AND "companyId" = $3
          AND status NOT IN ('DELIVERED','CANCELLED')
        RETURNING *`,
      [status, orderId, companyId],
    );

    if (!rows[0]) {
      throw new BadRequestException('سفارش یافت نشد یا وضعیتش نهایی است');
    }
    return rows[0];
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         (SELECT COUNT(*) FROM "OnlineOrder"
           WHERE "companyId" = $1 AND status = 'PLACED') AS "newOrders",
         (SELECT COUNT(*) FROM "OnlineOrder"
           WHERE "companyId" = $1 AND status NOT IN ('DELIVERED','CANCELLED'))
             AS "openOrders",
         (SELECT COALESCE(SUM(total),0) FROM "OnlineOrder"
           WHERE "companyId" = $1 AND status <> 'CANCELLED'
             AND "placedAt" >= date_trunc('month', now())) AS "monthSales",
         (SELECT COUNT(*) FROM "Product"
           WHERE "companyId" = $1 AND "isOnline" = true) AS "onlineProducts"`,
      [companyId],
    );

    return rows[0];
  }
}
