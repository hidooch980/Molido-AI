import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';

import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';
import { N8nService } from '../n8n/n8n.service';
import {
  AddItemsDto,
  CreateOrderDto,
  MenuItemDto,
  OrderItemDto,
  SetRecipeDto,
  StationDto,
  SettleOrderDto,
} from './dto/restaurant.dto';

type Row = Record<string, unknown>;
type OrderRow = Row & {
  id: string;
  status: string;
  tableId: string | null;
  items: Array<Row & { id: string; status: string }>;
};

/** Order statuses that still occupy a table. */
const OPEN_ORDER_STATUSES = ['OPEN', 'IN_KITCHEN', 'READY', 'SERVED'];
const CLOSED_ORDER_STATUSES = ['PAID', 'CANCELLED'];
const ITEM_STATUSES = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'];

/** ایستگاه‌های آشپزخانه — از StationDto گرفته می‌شود تا دو جا از هم دور نیفتند. */
const STATIONS: string[] = Object.values(StationDto);
const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED'];

const DEFAULT_RESERVATION_MINUTES = 90;
/** How far back to look for a clashing reservation on the same table. */
const RESERVATION_LOOKBACK_HOURS = 4;

const AREA_WRITABLE = ['name', 'floor', 'isSmoking', 'isOutdoor', 'isActive'] as const;
const TABLE_WRITABLE = ['areaId', 'tableNo', 'capacity', 'status', 'qrCode', 'note'] as const;
const MENU_CATEGORY_WRITABLE = [
  'name',
  'nameEn',
  'nameAr',
  'sortOrder',
  'icon',
  'isActive',
] as const;
const MENU_ITEM_WRITABLE = [
  'categoryId',
  'code',
  'name',
  'nameEn',
  'nameAr',
  'description',
  'imageUrl',
  'price',
  'cost',
  'taxRate',
  'station',
  'prepMinutes',
  'calories',
  'isAvailable',
  'isSpicy',
  'isVegan',
  'sortOrder',
] as const;
const RESERVATION_WRITABLE = [
  'tableId',
  'customerName',
  'phone',
  'guests',
  'reservedAt',
  'durationMin',
  'status',
  'note',
] as const;

/** Tables the `ensure` helper may be pointed at, scoped by companyId. */
const SCOPED_TABLES = {
  restaurantArea: 'RestaurantArea',
  restaurantTable: 'RestaurantTable',
  menuCategory: 'MenuCategory',
  menuItem: 'MenuItem',
  tableReservation: 'TableReservation',
} as const;

/**
 * سرویس کافه‌رستوران
 *
 * پوشش: سالن و میز، منو، رسپی مواد اولیه، سفارش (سالن/بیرون‌بر/دلیوری)،
 * صفحه آشپزخانه (KDS)، رزرو میز، شیفت و انعام.
 */
@Injectable()
export class RestaurantService {
  constructor(
    private readonly db: DatabaseService,
    private readonly n8n: N8nService,
  ) {}

  // ═══════════════ سالن ═══════════════

  areas(companyId: string) {
    return this.db.query(
      `SELECT a.*, (SELECT count(*)::int FROM "RestaurantTable" t WHERE t."areaId" = a.id)
                AS "tablesCount"
       FROM "RestaurantArea" a WHERE a."companyId" = $1 ORDER BY a.name ASC`,
      [companyId],
    );
  }

  createArea(companyId: string, data: Row) {
    return this.insert('RestaurantArea', companyId, AREA_WRITABLE, data);
  }

  async updateArea(companyId: string, id: string, data: Row) {
    await this.ensure('restaurantArea', companyId, id, 'سالن یافت نشد');
    return this.patch('RestaurantArea', id, AREA_WRITABLE, data);
  }

  async removeArea(companyId: string, id: string) {
    const area = await this.ensure('restaurantArea', companyId, id, 'سالن یافت نشد');

    // مثل حذف میز: کلید خارجی SET NULL است، پس حذف سالنِ پر خطا
    // نمی‌دهد و میزها بی‌صدا بی‌سالن می‌شوند — روی نقشهٔ سالن ناپدید
    // می‌شوند بی‌آنکه کسی بفهمد چرا.
    const tables = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "RestaurantTable" WHERE "areaId" = $1',
      [id],
    );
    if (Number(tables[0]?.count ?? 0) > 0) {
      throw new BadRequestException(
        `این سالن ${tables[0].count} میز دارد؛ اول میزها را جابه‌جا یا حذف کنید`,
      );
    }

    await this.db.execute('DELETE FROM "RestaurantArea" WHERE id = $1', [id]);
    return area;
  }

  // ═══════════════ میز ═══════════════

  tables(companyId: string, query: Row = {}) {
    const params = new Params();
    const conditions = [`t."companyId" = ${params.next(companyId)}`];
    if (query.areaId) conditions.push(`t."areaId" = ${params.next(query.areaId)}`);
    if (query.status) conditions.push(`t.status = ${params.next(query.status)}`);

    return this.db.query(
      `SELECT t.*, a.name AS "areaName",
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'id', o.id, 'orderNo', o."orderNo", 'total', o.total, 'openedAt', o."openedAt"))
                 FROM "RestaurantOrder" o
                 WHERE o."tableId" = t.id AND o.status = ANY(${params.next(OPEN_ORDER_STATUSES)})),
                '[]'::json) AS orders
       FROM "RestaurantTable" t LEFT JOIN "RestaurantArea" a ON a.id = t."areaId"
       WHERE ${conditions.join(' AND ')} ORDER BY t."tableNo" ASC`,
      params.values,
    );
  }

  createTable(companyId: string, data: Row) {
    return this.insert('RestaurantTable', companyId, TABLE_WRITABLE, data);
  }

  async updateTable(companyId: string, id: string, data: Row) {
    await this.ensure('restaurantTable', companyId, id, 'میز یافت نشد');
    return this.patch('RestaurantTable', id, TABLE_WRITABLE, data);
  }

  async removeTable(companyId: string, id: string) {
    const table = await this.ensure('restaurantTable', companyId, id, 'میز یافت نشد');

    // ⚠️ کلید خارجی روی SET NULL است، پس حذف خطا نمی‌دهد — سفارشِ باز
    //    فقط بی‌صدا بی‌میز می‌شود و گارسون دیگر نمی‌داند غذا کجا برود.
    //    نبودِ خطای دیتابیس یعنی این نگهبان باید اینجا باشد.
    const open = await this.db.query<{ orderNo: string }>(
      `SELECT "orderNo" FROM "RestaurantOrder"
       WHERE "tableId" = $1 AND NOT (status = ANY($2)) LIMIT 1`,
      [id, CLOSED_ORDER_STATUSES],
    );
    if (open[0]) {
      throw new BadRequestException(
        `این میز سفارش باز دارد (${open[0].orderNo}); اول آن را تسویه یا لغو کنید`,
      );
    }

    await this.db.execute('DELETE FROM "RestaurantTable" WHERE id = $1', [id]);
    return table;
  }

  // ═══════════════ دسته‌بندی منو ═══════════════

  menuCategories(companyId: string) {
    return this.db.query(
      `SELECT c.*, (SELECT count(*)::int FROM "MenuItem" i WHERE i."categoryId" = c.id)
                AS "itemsCount"
       FROM "MenuCategory" c WHERE c."companyId" = $1
       ORDER BY c."sortOrder" ASC, c.name ASC`,
      [companyId],
    );
  }

  createMenuCategory(companyId: string, data: Row) {
    return this.insert('MenuCategory', companyId, MENU_CATEGORY_WRITABLE, data);
  }

  async updateMenuCategory(companyId: string, id: string, data: Row) {
    await this.ensure('menuCategory', companyId, id, 'دسته‌بندی یافت نشد');
    return this.patch('MenuCategory', id, MENU_CATEGORY_WRITABLE, data);
  }

  // ═══════════════ آیتم منو ═══════════════

  /** منوی کامل، گروه‌بندی‌شده بر اساس دسته */
  async menu(companyId: string, query: Row = {}) {
    const showAll = Boolean(query.all);

    const categories = await this.db.query<Row & { id: string }>(
      `SELECT * FROM "MenuCategory"
       WHERE "companyId" = $1 ${showAll ? '' : 'AND "isActive" = true'}
       ORDER BY "sortOrder" ASC, name ASC`,
      [companyId],
    );

    const items = await this.db.query<Row & { categoryId: string | null }>(
      `SELECT * FROM "MenuItem"
       WHERE "companyId" = $1 ${showAll ? '' : 'AND "isAvailable" = true'}
       ORDER BY "sortOrder" ASC, name ASC`,
      [companyId],
    );

    const grouped = categories.map((category) => ({
      ...category,
      items: items.filter((item) => item.categoryId === category.id),
    }));

    const uncategorized = items.filter((item) => item.categoryId === null);
    return uncategorized.length
      ? [...grouped, { id: null, name: 'متفرقه', sortOrder: 999, items: uncategorized }]
      : grouped;
  }

  menuItems(companyId: string, query: Row = {}) {
    const params = new Params();
    const conditions = [`i."companyId" = ${params.next(companyId)}`];
    if (query.categoryId) conditions.push(`i."categoryId" = ${params.next(query.categoryId)}`);
    if (query.station) conditions.push(`i.station = ${params.next(query.station)}`);
    if (query.search) conditions.push(`i.name ILIKE ${params.next(`%${query.search}%`)}`);

    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 500) : 200;

    return this.db.query(
      `SELECT i.*, c.name AS "categoryName" FROM "MenuItem" i
       LEFT JOIN "MenuCategory" c ON c.id = i."categoryId"
       WHERE ${conditions.join(' AND ')}
       ORDER BY i."sortOrder" ASC, i.name ASC LIMIT ${params.next(limit)}`,
      params.values,
    );
  }

  createMenuItem(companyId: string, dto: MenuItemDto) {
    return this.insert('MenuItem', companyId, MENU_ITEM_WRITABLE, { ...dto });
  }

  async updateMenuItem(companyId: string, id: string, data: Row) {
    await this.ensure('menuItem', companyId, id, 'آیتم منو یافت نشد');
    return this.patch('MenuItem', id, MENU_ITEM_WRITABLE, data);
  }

  async removeMenuItem(companyId: string, id: string) {
    const item = await this.ensure('menuItem', companyId, id, 'آیتم منو یافت نشد');
    await this.db.execute('DELETE FROM "MenuItem" WHERE id = $1', [id]);
    return item;
  }

  /** خاموش/روشن کردن آیتم (تمام شد / موجود شد) */
  async toggleAvailability(companyId: string, id: string) {
    const rows = await this.db.query(
      `UPDATE "MenuItem" SET "isAvailable" = NOT "isAvailable", "updatedAt" = now()
       WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('آیتم منو یافت نشد');
    return rows[0];
  }

  // ═══════════════ رسپی ═══════════════

  async recipe(companyId: string, menuItemId: string) {
    await this.ensure('menuItem', companyId, menuItemId, 'آیتم منو یافت نشد');

    return this.db.query(
      `SELECT r.*, p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit"
       FROM "MenuRecipe" r JOIN "Product" p ON p.id = r."productId"
       WHERE r."menuItemId" = $1`,
      [menuItemId],
    );
  }

  /** جایگزینی کامل رسپی یک آیتم */
  async setRecipe(companyId: string, menuItemId: string, dto: SetRecipeDto) {
    await this.ensure('menuItem', companyId, menuItemId, 'آیتم منو یافت نشد');

    const productIds = dto.lines.map((line) => line.productId);
    const found = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "Product" WHERE id = ANY($1) AND "companyId" = $2',
      [productIds, companyId],
    );
    if (Number(found[0]?.count ?? 0) !== new Set(productIds).size) {
      throw new BadRequestException('برخی مواد اولیه یافت نشدند');
    }

    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM "MenuRecipe" WHERE "menuItemId" = $1', [menuItemId]);
      for (const line of dto.lines) {
        await tx.query(
          `INSERT INTO "MenuRecipe" (id, "menuItemId", "productId", qty, unit, "wastePct")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            menuItemId,
            line.productId,
            line.qty,
            line.unit ?? null,
            line.wastePct ?? 0,
          ],
        );
      }
    });

    return this.recipe(companyId, menuItemId);
  }

  // ═══════════════ سفارش ═══════════════

  orders(companyId: string, query: Row = {}) {
    const params = new Params();
    const conditions = [`o."companyId" = ${params.next(companyId)}`];
    if (query.status) conditions.push(`o.status = ${params.next(query.status)}`);
    if (query.type) conditions.push(`o.type = ${params.next(query.type)}`);
    if (query.tableId) conditions.push(`o."tableId" = ${params.next(query.tableId)}`);
    if (query.open === 'true') {
      conditions.push(`o.status = ANY(${params.next(OPEN_ORDER_STATUSES)})`);
    }
    if (query.from) conditions.push(`o."openedAt" >= ${params.next(new Date(String(query.from)))}`);
    if (query.to) conditions.push(`o."openedAt" <= ${params.next(new Date(String(query.to)))}`);

    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 200) : 50;

    return this.db.query(
      `SELECT o.*, t."tableNo",
              COALESCE((SELECT json_agg(i.*) FROM "RestaurantOrderItem" i
                        WHERE i."orderId" = o.id), '[]'::json) AS items,
              (SELECT count(*)::int FROM "RestaurantOrderItem" i WHERE i."orderId" = o.id)
                AS "itemsCount"
       FROM "RestaurantOrder" o LEFT JOIN "RestaurantTable" t ON t.id = o."tableId"
       WHERE ${conditions.join(' AND ')}
       ORDER BY o."openedAt" DESC LIMIT ${params.next(limit)}`,
      params.values,
    );
  }

  async order(companyId: string, id: string): Promise<OrderRow> {
    const orders = await this.db.query<OrderRow>(
      `SELECT o.*, t."tableNo",
              CASE WHEN t.id IS NULL THEN NULL
                   ELSE json_build_object('id', t.id, 'tableNo', t."tableNo") END AS "table",
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE json_build_object('id', c.id, 'firstName', c."firstName",
                                          'lastName', c."lastName") END AS customer,
              CASE WHEN w.id IS NULL THEN NULL
                   ELSE json_build_object('id', w.id, 'firstName', w."firstName",
                                          'lastName', w."lastName") END AS waiter
       FROM "RestaurantOrder" o
       LEFT JOIN "RestaurantTable" t ON t.id = o."tableId"
       LEFT JOIN "Customer" c ON c.id = o."customerId"
       LEFT JOIN "User" w ON w.id = o."waiterId"
       WHERE o.id = $1 AND o."companyId" = $2`,
      [id, companyId],
    );
    if (!orders[0]) throw new NotFoundException('سفارش یافت نشد');

    const items = await this.db.query<Row & { id: string; status: string }>(
      `SELECT i.*, m.name AS "menuItemName" FROM "RestaurantOrderItem" i
       LEFT JOIN "MenuItem" m ON m.id = i."menuItemId"
       WHERE i."orderId" = $1 ORDER BY i."createdAt" ASC`,
      [id],
    );

    return { ...orders[0], items };
  }

  /**
   * ثبت سفارش جدید.
   * قیمت هر قلم از منو خوانده می‌شود مگر اینکه صراحتاً ارسال شده باشد.
   */
  async createOrder(companyId: string, userId: string, dto: CreateOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('سفارش باید حداقل یک قلم داشته باشد');
    }

    const type = dto.type ?? 'DINE_IN';
    if (type === 'DINE_IN' && !dto.tableId) {
      throw new BadRequestException('برای سفارش سالن، انتخاب میز الزامی است');
    }

    if (dto.tableId) {
      const tables = await this.db.query<{ status: string }>(
        'SELECT status FROM "RestaurantTable" WHERE id = $1 AND "companyId" = $2',
        [dto.tableId, companyId],
      );
      if (!tables[0]) throw new NotFoundException('میز یافت نشد');
      if (tables[0].status === 'OUT_OF_SERVICE') {
        throw new BadRequestException('این میز خارج از سرویس است');
      }
    }

    const { itemsData, subtotal } = await this.buildItems(companyId, dto.items);

    const discount = dto.discount ?? 0;
    const deliveryFee = type === 'DELIVERY' ? (dto.deliveryFee ?? 0) : 0;
    const net = subtotal - discount;
    if (net < 0) throw new BadRequestException('تخفیف بیش از مبلغ سفارش است');

    const serviceCharge = this.pct(net, dto.servicePercent);
    const tax = this.pct(net + serviceCharge, dto.taxPercent);
    const total = net + serviceCharge + tax + deliveryFee;

    const order = await this.db.transaction(async (tx) => {
      const created = await tx.query<OrderRow>(
        `INSERT INTO "RestaurantOrder"
           (id, "companyId", "orderNo", type, status, "tableId", "customerId", "waiterId",
            "guestCount", subtotal, discount, "serviceCharge", tax, "deliveryFee", total,
            "deliveryAddress", "deliveryPhone", note)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          randomUUID(),
          companyId,
          `ORD-${Date.now()}`,
          type,
          dto.tableId ?? null,
          dto.customerId ?? null,
          userId,
          dto.guestCount ?? 1,
          subtotal,
          discount,
          serviceCharge,
          tax,
          deliveryFee,
          total,
          dto.deliveryAddress ?? null,
          dto.deliveryPhone ?? null,
          dto.note ?? null,
        ],
      );
      const row = created.rows[0];
      const items = await this.insertOrderItems(tx, row.id, itemsData);

      if (dto.tableId) {
        await tx.query(
          `UPDATE "RestaurantTable" SET status = 'OCCUPIED', "updatedAt" = now() WHERE id = $1`,
          [dto.tableId],
        );
      }

      return { ...row, items };
    });

    await this.n8n
      .restaurantOrderCreated(order as never, companyId)
      .catch(() => undefined);

    return order;
  }

  /** افزودن اقلام به سفارش باز و به‌روزرسانی مبالغ */
  async addItems(companyId: string, id: string, dto: AddItemsDto) {
    const order = await this.order(companyId, id);
    this.assertOpen(order);

    const { itemsData } = await this.buildItems(companyId, dto.items);

    await this.db.transaction(async (tx) => {
      await this.insertOrderItems(tx, id, itemsData);
    });

    return this.recalc(id);
  }

  async removeItem(companyId: string, id: string, itemId: string) {
    const order = await this.order(companyId, id);
    this.assertOpen(order);

    const items = await this.db.query<{ status: string }>(
      'SELECT status FROM "RestaurantOrderItem" WHERE id = $1 AND "orderId" = $2',
      [itemId, id],
    );
    if (!items[0]) throw new NotFoundException('قلم سفارش یافت نشد');
    if (items[0].status === 'SERVED') {
      throw new BadRequestException('قلم سرو شده قابل حذف نیست');
    }

    await this.db.execute('DELETE FROM "RestaurantOrderItem" WHERE id = $1', [itemId]);
    return this.recalc(id);
  }

  /** ارسال اقلام در انتظار به آشپزخانه */
  async sendToKitchen(companyId: string, id: string) {
    const order = await this.order(companyId, id);
    this.assertOpen(order);

    const sent = await this.db.execute(
      `UPDATE "RestaurantOrderItem" SET status = 'PREPARING', "sentAt" = now()
       WHERE "orderId" = $1 AND status = 'PENDING'`,
      [id],
    );
    if (!sent) {
      throw new BadRequestException('قلم جدیدی برای ارسال به آشپزخانه نیست');
    }

    const rows = await this.db.query<Row & { orderNo: string }>(
      `UPDATE "RestaurantOrder"
       SET status = 'IN_KITCHEN', "kitchenAt" = COALESCE("kitchenAt", now()), "updatedAt" = now()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    const items = await this.db.query(
      'SELECT * FROM "RestaurantOrderItem" WHERE "orderId" = $1',
      [id],
    );
    const updated = { ...rows[0], items };

    await this.n8n
      .restaurantSentToKitchen(
        { orderId: id, orderNo: rows[0].orderNo, itemsSent: sent },
        companyId,
      )
      .catch(() => undefined);

    return updated;
  }

  /** صفحه آشپزخانه (KDS) — اقلام در حال آماده‌سازی به تفکیک ایستگاه */
  async kitchenBoard(companyId: string, station?: string) {
    const params = new Params();
    const conditions = [
      `o."companyId" = ${params.next(companyId)}`,
      `NOT (o.status = ANY(${params.next(CLOSED_ORDER_STATUSES)}))`,
      `i.status = ANY(${params.next(['PREPARING', 'READY'])})`,
    ];
    // ایستگاه ناشناس فهرست خالی می‌داد، نه خطا.
    //
    // این همان اشتباهی است که در `/retail/search` هم بود: نام پارامتر
    // یا مقدارش غلط باشد، پاسخ ۲۰۰ با فهرست خالی است و آشپز فکر
    // می‌کند سفارشی نیست — در حالی که سفارش هست و او نمی‌بیندش.
    if (station) {
      if (!STATIONS.includes(station)) {
        throw new BadRequestException(
          `ایستگاه «${station}» شناخته نشد. مقادیر مجاز: ${STATIONS.join('، ')}`,
        );
      }
      conditions.push(`i.station = ${params.next(station)}`);
    }

    const items = await this.db.query<Row & { sentAt: string | null }>(
      `SELECT i.*, o."orderNo", o.type AS "orderType", o."openedAt", t."tableNo"
       FROM "RestaurantOrderItem" i
       JOIN "RestaurantOrder" o ON o.id = i."orderId"
       LEFT JOIN "RestaurantTable" t ON t.id = o."tableId"
       WHERE ${conditions.join(' AND ')} ORDER BY i."sentAt" ASC`,
      params.values,
    );

    const now = Date.now();
    return items.map((item) => ({
      ...item,
      waitingMinutes: item.sentAt
        ? Math.floor((now - new Date(item.sentAt).getTime()) / 60000)
        : 0,
    }));
  }

  /** تغییر وضعیت یک قلم: PREPARING → READY → SERVED */
  async setItemStatus(companyId: string, itemId: string, status: string) {
    if (!ITEM_STATUSES.includes(status)) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }

    const items = await this.db.query<{ orderId: string }>(
      `SELECT i."orderId" FROM "RestaurantOrderItem" i
       JOIN "RestaurantOrder" o ON o.id = i."orderId"
       WHERE i.id = $1 AND o."companyId" = $2`,
      [itemId, companyId],
    );
    if (!items[0]) throw new NotFoundException('قلم سفارش یافت نشد');

    const extra =
      status === 'READY'
        ? ', "readyAt" = now()'
        : status === 'SERVED'
          ? ', "servedAt" = now(), "readyAt" = COALESCE("readyAt", now())'
          : '';

    const updated = await this.db.query(
      `UPDATE "RestaurantOrderItem" SET status = $1${extra} WHERE id = $2 RETURNING *`,
      [status, itemId],
    );

    await this.syncOrderStatus(items[0].orderId);
    return updated[0];
  }

  /**
   * تسویه سفارش:
   * - ثبت پرداخت و واریز به صندوق
   * - آزادسازی میز
   * - کسر خودکار مواد اولیه از انبار طبق رسپی (اگر warehouseId داده شود)
   */
  async settle(companyId: string, id: string, dto: SettleOrderDto) {
    const order = await this.order(companyId, id);

    if (order.status === 'PAID') {
      throw new BadRequestException('این سفارش قبلاً تسویه شده است');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('سفارش لغو شده قابل تسویه نیست');
    }

    if (dto.warehouseId) {
      const warehouses = await this.db.query<{ id: string }>(
        'SELECT id FROM "Warehouse" WHERE id = $1 AND "companyId" = $2',
        [dto.warehouseId, companyId],
      );
      if (!warehouses[0]) throw new NotFoundException('انبار یافت نشد');
    }

    const total = Number(order.total);
    if (dto.paidAmount < total) {
      throw new BadRequestException(
        `مبلغ پرداختی کمتر از مبلغ سفارش (${total.toLocaleString('fa-IR')}) است`,
      );
    }

    if (dto.cashBoxId) {
      const cashBoxes = await this.db.query<{ id: string }>(
        'SELECT id FROM "CashBox" WHERE id = $1 AND "companyId" = $2',
        [dto.cashBoxId, companyId],
      );
      if (!cashBoxes[0]) throw new NotFoundException('صندوق یافت نشد');
    }

    const settled = await this.db.transaction(async (tx) => {
      if (dto.warehouseId) {
        await this.consumeIngredients(tx, order, dto.warehouseId);
      }

      const updated = await tx.query<Row>(
        `UPDATE "RestaurantOrder"
         SET status = 'PAID', "paidAmount" = $1, "tipAmount" = $2, "paymentMethod" = $3,
             "closedAt" = now(), "updatedAt" = now()
         WHERE id = $4 RETURNING *`,
        [dto.paidAmount, dto.tipAmount ?? 0, dto.paymentMethod ?? 'CASH', id],
      );

      await tx.query(
        `UPDATE "RestaurantOrderItem" SET status = 'SERVED', "servedAt" = now()
         WHERE "orderId" = $1 AND NOT (status = ANY($2))`,
        [id, ['CANCELLED', 'SERVED']],
      );

      if (order.tableId) {
        await tx.query(
          `UPDATE "RestaurantTable" SET status = 'CLEANING', "updatedAt" = now() WHERE id = $1`,
          [order.tableId],
        );
      }

      if (dto.cashBoxId) {
        await tx.query(
          'UPDATE "CashBox" SET balance = balance + $1, "updatedAt" = now() WHERE id = $2',
          [total + (dto.tipAmount ?? 0), dto.cashBoxId],
        );
      }

      return updated.rows[0];
    });

    await this.n8n
      .restaurantOrderSettled(settled as never, companyId)
      .catch(() => undefined);

    return settled;
  }

  async cancelOrder(companyId: string, id: string, reason?: string) {
    const order = await this.order(companyId, id);
    if (order.status === 'PAID') {
      throw new BadRequestException('سفارش تسویه‌شده قابل لغو نیست');
    }

    return this.db.transaction(async (tx) => {
      const note = reason ? `${order.note ?? ''}\nلغو: ${reason}`.trim() : order.note;

      const updated = await tx.query<Row>(
        `UPDATE "RestaurantOrder"
         SET status = 'CANCELLED', "closedAt" = now(), note = $1, "updatedAt" = now()
         WHERE id = $2 RETURNING *`,
        [note, id],
      );

      await tx.query(`UPDATE "RestaurantOrderItem" SET status = 'CANCELLED' WHERE "orderId" = $1`, [
        id,
      ]);

      if (order.tableId) {
        await tx.query(
          `UPDATE "RestaurantTable" SET status = 'FREE', "updatedAt" = now() WHERE id = $1`,
          [order.tableId],
        );
      }

      return updated.rows[0];
    });
  }

  // ═══════════════ رزرو ═══════════════

  reservations(companyId: string, query: Row = {}) {
    const params = new Params();
    const conditions = [`r."companyId" = ${params.next(companyId)}`];
    if (query.status) conditions.push(`r.status = ${params.next(query.status)}`);
    if (query.date) {
      conditions.push(`r."reservedAt" >= ${params.next(new Date(`${query.date}T00:00:00`))}`);
      conditions.push(`r."reservedAt" <= ${params.next(new Date(`${query.date}T23:59:59`))}`);
    }

    return this.db.query(
      `SELECT r.*, t."tableNo" FROM "TableReservation" r
       LEFT JOIN "RestaurantTable" t ON t.id = r."tableId"
       WHERE ${conditions.join(' AND ')} ORDER BY r."reservedAt" ASC LIMIT 200`,
      params.values,
    );
  }

  async createReservation(companyId: string, data: Row) {
    if (!data?.reservedAt) {
      throw new BadRequestException('زمان رزرو الزامی است');
    }

    const reservedAt = new Date(String(data.reservedAt));
    const durationMin = Number(data.durationMin) || DEFAULT_RESERVATION_MINUTES;

    if (data.tableId) {
      const tables = await this.db.query<{ id: string }>(
        'SELECT id FROM "RestaurantTable" WHERE id = $1 AND "companyId" = $2',
        [data.tableId, companyId],
      );
      if (!tables[0]) throw new NotFoundException('میز یافت نشد');

      // تداخل با رزروهای فعال همان میز
      const windowStart = new Date(
        reservedAt.getTime() - RESERVATION_LOOKBACK_HOURS * 3600_000,
      );
      const windowEnd = new Date(reservedAt.getTime() + durationMin * 60_000);

      const nearby = await this.db.query<{ reservedAt: string; durationMin: number | null }>(
        `SELECT "reservedAt", "durationMin" FROM "TableReservation"
         WHERE "tableId" = $1 AND status = ANY($2) AND "reservedAt" BETWEEN $3 AND $4`,
        [data.tableId, ACTIVE_RESERVATION_STATUSES, windowStart, windowEnd],
      );

      const clash = nearby.some((row) => {
        const start = new Date(row.reservedAt).getTime();
        const end = start + (row.durationMin ?? DEFAULT_RESERVATION_MINUTES) * 60_000;
        return reservedAt.getTime() < end && windowEnd.getTime() > start;
      });
      if (clash) {
        throw new BadRequestException('این میز در بازه انتخابی رزرو شده است');
      }
    }

    return this.insert('TableReservation', companyId, RESERVATION_WRITABLE, {
      ...data,
      reservedAt,
      durationMin,
    });
  }

  async updateReservation(companyId: string, id: string, data: Row) {
    await this.ensure('tableReservation', companyId, id, 'رزرو یافت نشد');

    const payload = { ...data };
    if (payload.reservedAt) payload.reservedAt = new Date(String(payload.reservedAt));

    return this.patch('TableReservation', id, RESERVATION_WRITABLE, payload);
  }

  // ═══════════════ شیفت ═══════════════

  shifts(companyId: string) {
    return this.db.query(
      `SELECT s.*, u."firstName", u."lastName" FROM "RestaurantShift" s
       LEFT JOIN "User" u ON u.id = s."userId"
       WHERE s."companyId" = $1 ORDER BY s."startedAt" DESC LIMIT 50`,
      [companyId],
    );
  }

  async openShift(companyId: string, userId: string, data: Row = {}) {
    const rows = await this.db.query(
      `INSERT INTO "RestaurantShift" (id, "companyId", "userId", "openingCash", note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [randomUUID(), companyId, userId, data.openingCash ?? 0, data.note ?? null],
    );
    return rows[0];
  }

  /** بستن شیفت — فروش و انعام بازه شیفت محاسبه می‌شود */
  async closeShift(companyId: string, id: string, data: Row = {}) {
    const shifts = await this.db.query<{
      id: string;
      startedAt: string;
      endedAt: string | null;
      note: string | null;
    }>('SELECT * FROM "RestaurantShift" WHERE id = $1 AND "companyId" = $2', [id, companyId]);
    const shift = shifts[0];

    if (!shift) throw new NotFoundException('شیفت یافت نشد');
    if (shift.endedAt) throw new BadRequestException('این شیفت بسته شده است');

    const endedAt = new Date();
    const totals = await this.db.query<{ total: string; tips: string; count: string }>(
      `SELECT COALESCE(sum(total), 0)::text AS total,
              COALESCE(sum("tipAmount"), 0)::text AS tips,
              count(*)::text AS count
       FROM "RestaurantOrder"
       WHERE "companyId" = $1 AND status = 'PAID' AND "closedAt" BETWEEN $2 AND $3`,
      [companyId, shift.startedAt, endedAt],
    );

    const rows = await this.db.query(
      `UPDATE "RestaurantShift"
       SET "endedAt" = $1, "closingCash" = $2, "totalSales" = $3, "tipsAmount" = $4,
           "ordersCount" = $5, note = $6
       WHERE id = $7 RETURNING *`,
      [
        endedAt,
        data.closingCash ?? 0,
        Number(totals[0]?.total ?? 0),
        Number(totals[0]?.tips ?? 0),
        Number(totals[0]?.count ?? 0),
        data.note ?? shift.note,
        id,
      ],
    );
    return rows[0];
  }

  // ═══════════════ گزارش ═══════════════

  async stats(companyId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await this.db.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM "RestaurantOrder"
          WHERE "companyId" = $1 AND status = ANY($2)) AS open_orders,
         (SELECT count(*)::text FROM "RestaurantOrder"
          WHERE "companyId" = $1 AND status = 'PAID' AND "closedAt" >= $3) AS today_orders,
         (SELECT COALESCE(sum(total), 0)::text FROM "RestaurantOrder"
          WHERE "companyId" = $1 AND status = 'PAID' AND "closedAt" >= $3) AS today_sales,
         (SELECT COALESCE(sum("guestCount"), 0)::text FROM "RestaurantOrder"
          WHERE "companyId" = $1 AND status = 'PAID' AND "closedAt" >= $3) AS guests,
         (SELECT count(*)::text FROM "RestaurantTable" WHERE "companyId" = $1) AS tables,
         (SELECT count(*)::text FROM "RestaurantTable"
          WHERE "companyId" = $1 AND status = 'FREE') AS free_tables,
         (SELECT count(*)::text FROM "MenuItem" WHERE "companyId" = $1) AS menu_count,
         (SELECT count(*)::text FROM "MenuItem"
          WHERE "companyId" = $1 AND "isAvailable" = false) AS unavailable,
         (SELECT count(*)::text FROM "TableReservation"
          WHERE "companyId" = $1 AND "reservedAt" >= $3 AND status = ANY($4))
           AS today_reservations`,
      [companyId, OPEN_ORDER_STATUSES, startOfDay, ['PENDING', 'CONFIRMED']],
    );

    const row = rows[0] ?? {};
    const todayOrders = Number(row.today_orders ?? 0);
    const todaySales = Number(row.today_sales ?? 0);
    const tables = Number(row.tables ?? 0);
    const freeTables = Number(row.free_tables ?? 0);

    return {
      openOrders: Number(row.open_orders ?? 0),
      todayOrders,
      todaySales,
      avgTicket: todayOrders ? Math.round(todaySales / todayOrders) : 0,
      guests: Number(row.guests ?? 0),
      tables,
      freeTables,
      occupancyRate: tables ? Math.round(((tables - freeTables) / tables) * 100) : 0,
      menuCount: Number(row.menu_count ?? 0),
      unavailableItems: Number(row.unavailable ?? 0),
      todayReservations: Number(row.today_reservations ?? 0),
    };
  }

  /** پرفروش‌ترین آیتم‌ها */
  async topItems(companyId: string, query: Row = {}) {
    const from = query.from
      ? new Date(String(query.from))
      : new Date(Date.now() - 30 * 86400_000);
    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 200) : 20;

    const rows = await this.db.query<{
      menuItemId: string | null;
      name: string;
      qty: string;
      revenue: string;
    }>(
      `SELECT i."menuItemId", i.name,
              COALESCE(sum(i.qty), 0)::text AS qty,
              COALESCE(sum(i.total), 0)::text AS revenue
       FROM "RestaurantOrderItem" i
       JOIN "RestaurantOrder" o ON o.id = i."orderId"
       WHERE o."companyId" = $1 AND o.status = 'PAID' AND o."closedAt" >= $2
         AND i.status <> 'CANCELLED'
       GROUP BY i."menuItemId", i.name
       ORDER BY sum(i.total) DESC LIMIT $3`,
      [companyId, from, limit],
    );

    return rows.map((row) => ({
      menuItemId: row.menuItemId,
      name: row.name,
      qty: Number(row.qty),
      revenue: Number(row.revenue),
    }));
  }

  /** رسید چاپی سفارش (RTL) */
  async printReceipt(companyId: string, id: string) {
    const order = await this.order(companyId, id);
    const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');
    const table = order.table as { tableNo: string } | null;

    const rows = order.items
      .map(
        (item, index) =>
          `<tr><td>${index + 1}</td><td>${item.name}${
            item.note ? `<br><small>${item.note}</small>` : ''
          }</td><td>${fa(item.qty)}</td><td>${fa(item.unitPrice)}</td><td>${fa(
            item.total,
          )}</td></tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8" />
<title>رسید ${order.orderNo}</title>
<style>
  body { font-family: Tahoma, 'Vazirmatn', sans-serif; margin: 16px; color: #222; max-width: 420px; }
  h2 { text-align: center; margin: 4px 0; }
  .meta { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 1px dashed #999; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: center; }
  .totals { margin-top: 12px; font-size: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .grand { font-weight: bold; border-top: 1px solid #333; padding-top: 6px; }
  .footer { text-align: center; margin-top: 16px; font-size: 12px; color: #666; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h2>رسید فروش</h2>
  <div class="meta">
    <div>
      <div>شماره: ${order.orderNo}</div>
      <div>${table ? `میز: ${table.tableNo}` : `نوع: ${order.type}`}</div>
    </div>
    <div>
      <div>${new Date(order.openedAt as string).toLocaleString('fa-IR')}</div>
      <div>نفرات: ${fa(order.guestCount)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>شرح</th><th>تعداد</th><th>فی</th><th>جمع</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>جمع اقلام</span><span>${fa(order.subtotal)}</span></div>
    <div><span>تخفیف</span><span>${fa(order.discount)}</span></div>
    <div><span>حق سرویس</span><span>${fa(order.serviceCharge)}</span></div>
    <div><span>مالیات</span><span>${fa(order.tax)}</span></div>
    ${
      Number(order.deliveryFee) > 0
        ? `<div><span>هزینه ارسال</span><span>${fa(order.deliveryFee)}</span></div>`
        : ''
    }
    <div class="grand"><span>قابل پرداخت</span><span>${fa(order.total)}</span></div>
  </div>
  <div class="footer">از انتخاب شما سپاسگزاریم 🌿</div>
  <button class="no-print" onclick="window.print()">چاپ</button>
</body>
</html>`;
  }

  // ═══════════════ کمکی ═══════════════

  private pct(base: number, percent?: number) {
    if (!percent || percent <= 0) return 0;
    return Math.round(base * (percent / 100) * 100) / 100;
  }

  private assertOpen(order: OrderRow) {
    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException('این سفارش بسته شده است');
    }
  }

  /** Loads a company-scoped row or throws. */
  private async ensure(
    model: keyof typeof SCOPED_TABLES,
    companyId: string,
    id: string,
    message: string,
  ) {
    const rows = await this.db.query<Row & { id: string }>(
      `SELECT * FROM "${SCOPED_TABLES[model]}" WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException(message);
    return rows[0];
  }

  private async insert(
    table: string,
    companyId: string,
    columns: readonly string[],
    data: Row,
  ) {
    const params = new Params();
    const names = ['id', 'companyId'];
    const placeholders = [params.next(randomUUID()), params.next(companyId)];

    for (const column of columns) {
      if (data[column] === undefined) continue;
      names.push(column);
      placeholders.push(params.next(data[column]));
    }

    const rows = await this.db.query(
      `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(', ')})
       VALUES (${placeholders.join(', ')}) RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  private async patch(table: string, id: string, columns: readonly string[], data: Row) {
    const params = new Params();
    const assignments = setClause(columns, data, params);
    if (!assignments) {
      const current = await this.db.query(`SELECT * FROM "${table}" WHERE id = $1`, [id]);
      return current[0];
    }

    const rows = await this.db.query(
      `UPDATE "${table}" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  private async insertOrderItems(tx: PoolClient, orderId: string, itemsData: Row[]) {
    const created: Row[] = [];
    for (const item of itemsData) {
      const row = await tx.query<Row>(
        `INSERT INTO "RestaurantOrderItem"
           (id, "orderId", "menuItemId", name, qty, "unitPrice", discount, total,
            station, note, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING') RETURNING *`,
        [
          randomUUID(),
          orderId,
          item.menuItemId,
          item.name,
          item.qty,
          item.unitPrice,
          item.discount,
          item.total,
          item.station,
          item.note,
        ],
      );
      created.push(row.rows[0]);
    }
    return created;
  }

  /** ساخت اقلام سفارش با قیمت‌گذاری از منو */
  private async buildItems(companyId: string, items: OrderItemDto[]) {
    const ids = items
      .map((item) => item.menuItemId)
      .filter((value): value is string => Boolean(value));

    const menuItems = ids.length
      ? await this.db.query<{
          id: string;
          name: string;
          price: string;
          station: string;
          isAvailable: boolean;
        }>('SELECT * FROM "MenuItem" WHERE id = ANY($1) AND "companyId" = $2', [ids, companyId])
      : [];

    if (menuItems.length !== new Set(ids).size) {
      throw new BadRequestException('برخی آیتم‌های منو یافت نشدند');
    }
    const map = new Map(menuItems.map((item) => [item.id, item]));

    let subtotal = 0;
    const itemsData: Row[] = items.map((item) => {
      const menu = item.menuItemId ? map.get(item.menuItemId) : undefined;

      if (menu && !menu.isAvailable) {
        throw new BadRequestException(`«${menu.name}» در حال حاضر موجود نیست`);
      }

      const name = menu?.name ?? item.name;
      if (!name) throw new BadRequestException('نام قلم سفارش مشخص نیست');

      const unitPrice = item.unitPrice ?? Number(menu?.price ?? 0);
      const discount = item.discount ?? 0;
      const total = Math.round((unitPrice * item.qty - discount) * 100) / 100;
      if (total < 0) throw new BadRequestException(`تخفیف قلم «${name}» نامعتبر است`);

      subtotal += total;

      return {
        menuItemId: item.menuItemId ?? null,
        name,
        qty: item.qty,
        unitPrice,
        discount,
        total,
        station: menu?.station ?? 'KITCHEN',
        note: item.note ?? null,
      };
    });

    return { itemsData, subtotal: Math.round(subtotal * 100) / 100 };
  }

  /** بازمحاسبه مبالغ سفارش پس از تغییر اقلام */
  private async recalc(orderId: string) {
    const orders = await this.db.query<Row>(
      'SELECT * FROM "RestaurantOrder" WHERE id = $1',
      [orderId],
    );
    const order = orders[0];

    const totals = await this.db.query<{ sum: string }>(
      `SELECT COALESCE(sum(total), 0)::text AS sum FROM "RestaurantOrderItem"
       WHERE "orderId" = $1 AND status <> 'CANCELLED'`,
      [orderId],
    );
    const subtotal = Number(totals[0]?.sum ?? 0);
    const net = subtotal - Number(order.discount);

    // نسبت سرویس/مالیات قبلی حفظ می‌شود
    const prevNet = Number(order.subtotal) - Number(order.discount);
    const serviceRatio = prevNet > 0 ? Number(order.serviceCharge) / prevNet : 0;
    const taxRatio =
      prevNet + Number(order.serviceCharge) > 0
        ? Number(order.tax) / (prevNet + Number(order.serviceCharge))
        : 0;

    const serviceCharge = Math.round(net * serviceRatio * 100) / 100;
    const tax = Math.round((net + serviceCharge) * taxRatio * 100) / 100;

    const updated = await this.db.query<Row>(
      `UPDATE "RestaurantOrder"
       SET subtotal = $1, "serviceCharge" = $2, tax = $3, total = $4, "updatedAt" = now()
       WHERE id = $5 RETURNING *`,
      [
        subtotal,
        serviceCharge,
        tax,
        net + serviceCharge + tax + Number(order.deliveryFee),
        orderId,
      ],
    );

    const items = await this.db.query(
      'SELECT * FROM "RestaurantOrderItem" WHERE "orderId" = $1',
      [orderId],
    );
    return { ...updated[0], items };
  }

  /** همگام‌سازی وضعیت سفارش با وضعیت اقلام */
  private async syncOrderStatus(orderId: string) {
    const items = await this.db.query<{ status: string }>(
      `SELECT status FROM "RestaurantOrderItem" WHERE "orderId" = $1 AND status <> 'CANCELLED'`,
      [orderId],
    );
    if (!items.length) return;

    const orders = await this.db.query<{ status: string }>(
      'SELECT status FROM "RestaurantOrder" WHERE id = $1',
      [orderId],
    );
    if (!orders[0] || CLOSED_ORDER_STATUSES.includes(orders[0].status)) return;

    const status = items.every((item) => item.status === 'SERVED')
      ? 'SERVED'
      : items.every((item) => ['READY', 'SERVED'].includes(item.status))
        ? 'READY'
        : 'IN_KITCHEN';

    await this.db.execute(
      'UPDATE "RestaurantOrder" SET status = $1, "updatedAt" = now() WHERE id = $2',
      [status, orderId],
    );
  }

  /** کسر مواد اولیه از انبار طبق رسپی اقلام سفارش */
  private async consumeIngredients(tx: PoolClient, order: OrderRow, warehouseId: string) {
    const active = order.items.filter(
      (item) => item.menuItemId && item.status !== 'CANCELLED',
    );
    if (!active.length) return;

    const recipes = await tx.query<{
      menuItemId: string;
      productId: string;
      qty: string;
      wastePct: string | null;
    }>('SELECT * FROM "MenuRecipe" WHERE "menuItemId" = ANY($1)', [
      active.map((item) => item.menuItemId as string),
    ]);
    if (!recipes.rows.length) return;

    // جمع مصرف هر ماده اولیه
    const usage = new Map<string, number>();
    for (const item of active) {
      for (const recipe of recipes.rows.filter(
        (row) => row.menuItemId === item.menuItemId,
      )) {
        const waste = 1 + Number(recipe.wastePct ?? 0) / 100;
        const qty = Number(recipe.qty) * Number(item.qty) * waste;
        usage.set(recipe.productId, (usage.get(recipe.productId) ?? 0) + qty);
      }
    }

    for (const [productId, qty] of usage) {
      await tx.query(
        `UPDATE "Inventory" SET quantity = quantity - $1, "updatedAt" = now()
         WHERE "warehouseId" = $2 AND "productId" = $3`,
        [qty, warehouseId, productId],
      );
    }
  }
}
