import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { N8nService } from '../n8n/n8n.service';
import {
  AddItemsDto,
  CreateOrderDto,
  MenuItemDto,
  OrderItemDto,
  SetRecipeDto,
  SettleOrderDto,
} from './dto/restaurant.dto';

/**
 * سرویس کافه‌رستوران
 *
 * پوشش: سالن و میز، منو، رسپی مواد اولیه، سفارش (سالن/بیرون‌بر/دلیوری)،
 * صفحه آشپزخانه (KDS)، رزرو میز، شیفت و انعام.
 */
@Injectable()
export class RestaurantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n8n: N8nService,
  ) {}

  // ═══════════════ سالن ═══════════════

  areas(companyId: string) {
    return this.prisma.restaurantArea.findMany({
      where: { companyId },
      include: { _count: { select: { tables: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createArea(companyId: string, data: any) {
    return this.prisma.restaurantArea.create({ data: { ...data, companyId } });
  }

  async updateArea(companyId: string, id: string, data: any) {
    await this.ensure('restaurantArea', companyId, id, 'سالن یافت نشد');
    return this.prisma.restaurantArea.update({ where: { id }, data });
  }

  async removeArea(companyId: string, id: string) {
    await this.ensure('restaurantArea', companyId, id, 'سالن یافت نشد');
    return this.prisma.restaurantArea.delete({ where: { id } });
  }

  // ═══════════════ میز ═══════════════

  tables(companyId: string, query: any = {}) {
    return this.prisma.restaurantTable.findMany({
      where: {
        companyId,
        ...(query.areaId ? { areaId: query.areaId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        area: { select: { id: true, name: true } },
        orders: {
          where: { status: { in: ['OPEN', 'IN_KITCHEN', 'READY', 'SERVED'] } },
          select: { id: true, orderNo: true, total: true, openedAt: true },
        },
      },
      orderBy: { tableNo: 'asc' },
    });
  }

  createTable(companyId: string, data: any) {
    return this.prisma.restaurantTable.create({ data: { ...data, companyId } });
  }

  async updateTable(companyId: string, id: string, data: any) {
    await this.ensure('restaurantTable', companyId, id, 'میز یافت نشد');
    return this.prisma.restaurantTable.update({ where: { id }, data });
  }

  async removeTable(companyId: string, id: string) {
    await this.ensure('restaurantTable', companyId, id, 'میز یافت نشد');
    return this.prisma.restaurantTable.delete({ where: { id } });
  }

  // ═══════════════ دسته‌بندی منو ═══════════════

  menuCategories(companyId: string) {
    return this.prisma.menuCategory.findMany({
      where: { companyId },
      include: { _count: { select: { items: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createMenuCategory(companyId: string, data: any) {
    return this.prisma.menuCategory.create({ data: { ...data, companyId } });
  }

  async updateMenuCategory(companyId: string, id: string, data: any) {
    await this.ensure('menuCategory', companyId, id, 'دسته‌بندی یافت نشد');
    return this.prisma.menuCategory.update({ where: { id }, data });
  }

  // ═══════════════ آیتم منو ═══════════════

  /** منوی کامل، گروه‌بندی‌شده بر اساس دسته */
  async menu(companyId: string, query: any = {}) {
    const categories = await this.prisma.menuCategory.findMany({
      where: { companyId, ...(query.all ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: query.all ? {} : { isAvailable: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    // آیتم‌های بدون دسته‌بندی
    const uncategorized = await this.prisma.menuItem.findMany({
      where: {
        companyId,
        categoryId: null,
        ...(query.all ? {} : { isAvailable: true }),
      },
      orderBy: { name: 'asc' },
    });

    return uncategorized.length
      ? [
          ...categories,
          { id: null, name: 'متفرقه', sortOrder: 999, items: uncategorized },
        ]
      : categories;
  }

  menuItems(companyId: string, query: any = {}) {
    return this.prisma.menuItem.findMany({
      where: {
        companyId,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.station ? { station: query.station } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: query.limit ? Number(query.limit) : 200,
    });
  }

  createMenuItem(companyId: string, dto: MenuItemDto) {
    return this.prisma.menuItem.create({ data: { ...dto, companyId } as any });
  }

  async updateMenuItem(companyId: string, id: string, data: any) {
    await this.ensure('menuItem', companyId, id, 'آیتم منو یافت نشد');
    return this.prisma.menuItem.update({ where: { id }, data });
  }

  async removeMenuItem(companyId: string, id: string) {
    await this.ensure('menuItem', companyId, id, 'آیتم منو یافت نشد');
    return this.prisma.menuItem.delete({ where: { id } });
  }

  /** خاموش/روشن کردن آیتم (تمام شد / موجود شد) */
  async toggleAvailability(companyId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, companyId },
    });

    if (!item) throw new NotFoundException('آیتم منو یافت نشد');

    return this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: !item.isAvailable },
    });
  }

  // ═══════════════ رسپی ═══════════════

  async recipe(companyId: string, menuItemId: string) {
    await this.ensure('menuItem', companyId, menuItemId, 'آیتم منو یافت نشد');

    return this.prisma.menuRecipe.findMany({
      where: { menuItemId },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true } },
      },
    });
  }

  /** جایگزینی کامل رسپی یک آیتم */
  async setRecipe(companyId: string, menuItemId: string, dto: SetRecipeDto) {
    await this.ensure('menuItem', companyId, menuItemId, 'آیتم منو یافت نشد');

    const productIds = dto.lines.map((l) => l.productId);

    const found = await this.prisma.product.count({
      where: { id: { in: productIds }, companyId },
    });

    if (found !== new Set(productIds).size) {
      throw new BadRequestException('برخی مواد اولیه یافت نشدند');
    }

    return this.prisma.$transaction(async (tx: any) => {
      await tx.menuRecipe.deleteMany({ where: { menuItemId } });

      if (dto.lines.length) {
        await tx.menuRecipe.createMany({
          data: dto.lines.map((l) => ({ ...l, menuItemId })),
        });
      }

      return tx.menuRecipe.findMany({
        where: { menuItemId },
        include: { product: { select: { id: true, name: true, unit: true } } },
      });
    });
  }

  // ═══════════════ سفارش ═══════════════

  orders(companyId: string, query: any = {}) {
    return this.prisma.restaurantOrder.findMany({
      where: {
        companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.tableId ? { tableId: query.tableId } : {}),
        ...(query.open === 'true'
          ? { status: { in: ['OPEN', 'IN_KITCHEN', 'READY', 'SERVED'] } }
          : {}),
        ...(query.from || query.to
          ? {
              openedAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        table: { select: { id: true, tableNo: true } },
        items: true,
        _count: { select: { items: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: query.limit ? Math.min(Number(query.limit), 200) : 50,
    });
  }

  async order(companyId: string, id: string) {
    const order = await this.prisma.restaurantOrder.findFirst({
      where: { id, companyId },
      include: {
        table: { select: { id: true, tableNo: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        waiter: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: { menuItem: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) throw new NotFoundException('سفارش یافت نشد');

    return order;
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
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: dto.tableId, companyId },
      });

      if (!table) throw new NotFoundException('میز یافت نشد');

      if (table.status === 'OUT_OF_SERVICE') {
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

    const order = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.restaurantOrder.create({
        data: {
          companyId,
          orderNo: `ORD-${Date.now()}`,
          type: type as never,
          status: 'OPEN',
          tableId: dto.tableId ?? null,
          customerId: dto.customerId ?? null,
          waiterId: userId,
          guestCount: dto.guestCount ?? 1,
          subtotal,
          discount,
          serviceCharge,
          tax,
          deliveryFee,
          total,
          deliveryAddress: dto.deliveryAddress ?? null,
          deliveryPhone: dto.deliveryPhone ?? null,
          note: dto.note ?? null,
          items: { create: itemsData },
        },
        include: { items: true },
      });

      if (dto.tableId) {
        await tx.restaurantTable.update({
          where: { id: dto.tableId },
          data: { status: 'OCCUPIED' },
        });
      }

      return created;
    });

    await this.n8n
      .restaurantOrderCreated(order as never, companyId)
      .catch(() => undefined);

    return order;
  }

  /** افزودن اقلام به سفارش باز و به‌روزرسانی مبالغ */
  async addItems(companyId: string, id: string, dto: AddItemsDto) {
    const order = await this.order(companyId, id);

    if (['PAID', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException('این سفارش بسته شده است');
    }

    const { itemsData } = await this.buildItems(companyId, dto.items);

    await this.prisma.restaurantOrderItem.createMany({
      data: itemsData.map((i) => ({ ...i, orderId: id })),
    });

    return this.recalc(id);
  }

  async removeItem(companyId: string, id: string, itemId: string) {
    const order = await this.order(companyId, id);

    if (['PAID', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException('این سفارش بسته شده است');
    }

    const item = await this.prisma.restaurantOrderItem.findFirst({
      where: { id: itemId, orderId: id },
    });

    if (!item) throw new NotFoundException('قلم سفارش یافت نشد');

    if (item.status === 'SERVED') {
      throw new BadRequestException('قلم سرو شده قابل حذف نیست');
    }

    await this.prisma.restaurantOrderItem.delete({ where: { id: itemId } });

    return this.recalc(id);
  }

  /** ارسال اقلام در انتظار به آشپزخانه */
  async sendToKitchen(companyId: string, id: string) {
    const order = await this.order(companyId, id);

    if (['PAID', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException('این سفارش بسته شده است');
    }

    const now = new Date();

    const { count } = await this.prisma.restaurantOrderItem.updateMany({
      where: { orderId: id, status: 'PENDING' },
      data: { status: 'PREPARING', sentAt: now },
    });

    if (!count) {
      throw new BadRequestException('قلم جدیدی برای ارسال به آشپزخانه نیست');
    }

    const updated = await this.prisma.restaurantOrder.update({
      where: { id },
      data: { status: 'IN_KITCHEN', kitchenAt: order.kitchenAt ?? now },
      include: { items: true },
    });

    await this.n8n
      .restaurantSentToKitchen(
        { orderId: id, orderNo: updated.orderNo, itemsSent: count },
        companyId,
      )
      .catch(() => undefined);

    return updated;
  }

  /** صفحه آشپزخانه (KDS) — اقلام در حال آماده‌سازی به تفکیک ایستگاه */
  async kitchenBoard(companyId: string, station?: string) {
    const items = await this.prisma.restaurantOrderItem.findMany({
      where: {
        order: { companyId, status: { notIn: ['PAID', 'CANCELLED'] } },
        status: { in: ['PREPARING', 'READY'] },
        ...(station ? { station: station as never } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            type: true,
            openedAt: true,
            table: { select: { tableNo: true } },
          },
        },
      },
      orderBy: { sentAt: 'asc' },
    });

    const now = Date.now();

    return items.map((i: any) => ({
      ...i,
      waitingMinutes: i.sentAt
        ? Math.floor((now - new Date(i.sentAt).getTime()) / 60000)
        : 0,
    }));
  }

  /** تغییر وضعیت یک قلم: PREPARING → READY → SERVED */
  async setItemStatus(companyId: string, itemId: string, status: string) {
    const allowed = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'];

    if (!allowed.includes(status)) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }

    const item = await this.prisma.restaurantOrderItem.findFirst({
      where: { id: itemId, order: { companyId } },
    });

    if (!item) throw new NotFoundException('قلم سفارش یافت نشد');

    const now = new Date();

    const updated = await this.prisma.restaurantOrderItem.update({
      where: { id: itemId },
      data: {
        status: status as never,
        ...(status === 'READY' ? { readyAt: now } : {}),
        ...(status === 'SERVED' ? { servedAt: now, readyAt: item.readyAt ?? now } : {}),
      },
    });

    await this.syncOrderStatus(item.orderId);

    return updated;
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
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, companyId },
      });

      if (!warehouse) throw new NotFoundException('انبار یافت نشد');
    }

    const total = Number(order.total);

    if (dto.paidAmount < total) {
      throw new BadRequestException(
        `مبلغ پرداختی کمتر از مبلغ سفارش (${total.toLocaleString('fa-IR')}) است`,
      );
    }

    const settled = await this.prisma.$transaction(async (tx: any) => {
      if (dto.warehouseId) {
        await this.consumeIngredients(tx, order, dto.warehouseId);
      }

      const updated = await tx.restaurantOrder.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAmount: dto.paidAmount,
          tipAmount: dto.tipAmount ?? 0,
          paymentMethod: dto.paymentMethod ?? 'CASH',
          closedAt: new Date(),
        },
      });

      await tx.restaurantOrderItem.updateMany({
        where: { orderId: id, status: { notIn: ['CANCELLED', 'SERVED'] } },
        data: { status: 'SERVED', servedAt: new Date() },
      });

      if (order.tableId) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'CLEANING' },
        });
      }

      if (dto.cashBoxId) {
        const cashBox = await tx.cashBox.findFirst({
          where: { id: dto.cashBoxId, companyId },
        });

        if (!cashBox) throw new NotFoundException('صندوق یافت نشد');

        await tx.cashBox.update({
          where: { id: dto.cashBoxId },
          data: { balance: { increment: total + (dto.tipAmount ?? 0) } },
        });
      }

      return updated;
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

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.restaurantOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          closedAt: new Date(),
          note: reason ? `${order.note ?? ''}\nلغو: ${reason}`.trim() : order.note,
        },
      });

      await tx.restaurantOrderItem.updateMany({
        where: { orderId: id },
        data: { status: 'CANCELLED' },
      });

      if (order.tableId) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'FREE' },
        });
      }

      return updated;
    });
  }

  // ═══════════════ رزرو ═══════════════

  reservations(companyId: string, query: any = {}) {
    return this.prisma.tableReservation.findMany({
      where: {
        companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.date
          ? {
              reservedAt: {
                gte: new Date(`${query.date}T00:00:00`),
                lte: new Date(`${query.date}T23:59:59`),
              },
            }
          : {}),
      },
      include: { table: { select: { id: true, tableNo: true } } },
      orderBy: { reservedAt: 'asc' },
      take: 200,
    });
  }

  async createReservation(companyId: string, data: any) {
    if (!data?.reservedAt) {
      throw new BadRequestException('زمان رزرو الزامی است');
    }

    const reservedAt = new Date(data.reservedAt);
    const durationMin = Number(data.durationMin) || 90;

    if (data.tableId) {
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: data.tableId, companyId },
      });

      if (!table) throw new NotFoundException('میز یافت نشد');

      // تداخل با رزروهای فعال همان میز
      const windowStart = new Date(reservedAt.getTime() - 4 * 3600_000);
      const windowEnd = new Date(reservedAt.getTime() + durationMin * 60_000);

      const nearby = await this.prisma.tableReservation.findMany({
        where: {
          tableId: data.tableId,
          status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] },
          reservedAt: { gte: windowStart, lte: windowEnd },
        },
      });

      const clash = nearby.some((r: any) => {
        const start = new Date(r.reservedAt).getTime();
        const end = start + (r.durationMin ?? 90) * 60_000;
        return reservedAt.getTime() < end && windowEnd.getTime() > start;
      });

      if (clash) {
        throw new BadRequestException('این میز در بازه انتخابی رزرو شده است');
      }
    }

    return this.prisma.tableReservation.create({
      data: { ...data, companyId, reservedAt, durationMin },
    });
  }

  async updateReservation(companyId: string, id: string, data: any) {
    await this.ensure('tableReservation', companyId, id, 'رزرو یافت نشد');

    return this.prisma.tableReservation.update({
      where: { id },
      data: {
        ...data,
        ...(data.reservedAt ? { reservedAt: new Date(data.reservedAt) } : {}),
      },
    });
  }

  // ═══════════════ شیفت ═══════════════

  shifts(companyId: string) {
    return this.prisma.restaurantShift.findMany({
      where: { companyId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  /** شیفت باز فعلی (اگر وجود داشته باشد). */
  openShiftCurrent(companyId: string) {
    return this.prisma.restaurantShift.findFirst({
      where: { companyId, endedAt: null },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async openShift(companyId: string, userId: string, data: any = {}) {
    // دو شیفت باز هم‌زمان باعث دوباره‌شماری فروش در بستن شیفت می‌شود،
    // چون محاسبه بر اساس بازه زمانی است نه شناسه شیفت.
    const current = await this.openShiftCurrent(companyId);

    if (current) {
      throw new BadRequestException(
        'یک شیفت باز وجود دارد — ابتدا آن را ببندید.',
      );
    }

    return this.prisma.restaurantShift.create({
      data: {
        companyId,
        userId,
        openingCash: data.openingCash ?? 0,
        note: data.note ?? null,
      },
    });
  }

  /** بستن شیفت — فروش و انعام بازه شیفت محاسبه می‌شود */
  async closeShift(companyId: string, id: string, data: any = {}) {
    const shift = await this.prisma.restaurantShift.findFirst({
      where: { id, companyId },
    });

    if (!shift) throw new NotFoundException('شیفت یافت نشد');
    if (shift.endedAt) throw new BadRequestException('این شیفت بسته شده است');

    const endedAt = new Date();

    const paid = await this.prisma.restaurantOrder.findMany({
      where: {
        companyId,
        status: 'PAID',
        closedAt: { gte: shift.startedAt, lte: endedAt },
      },
      select: { total: true, tipAmount: true },
    });

    const totalSales = paid.reduce((s: number, o: any) => s + Number(o.total), 0);
    const tipsAmount = paid.reduce(
      (s: number, o: any) => s + Number(o.tipAmount),
      0,
    );

    return this.prisma.restaurantShift.update({
      where: { id },
      data: {
        endedAt,
        closingCash: data.closingCash ?? 0,
        totalSales,
        tipsAmount,
        ordersCount: paid.length,
        note: data.note ?? shift.note,
      },
    });
  }

  // ═══════════════ گزارش ═══════════════

  async stats(companyId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      openOrders,
      todayPaid,
      tables,
      freeTables,
      menuCount,
      unavailable,
      todayReservations,
    ] = await Promise.all([
      this.prisma.restaurantOrder.count({
        where: {
          companyId,
          status: { in: ['OPEN', 'IN_KITCHEN', 'READY', 'SERVED'] },
        },
      }),
      this.prisma.restaurantOrder.findMany({
        where: { companyId, status: 'PAID', closedAt: { gte: startOfDay } },
        select: { total: true, guestCount: true, type: true },
      }),
      this.prisma.restaurantTable.count({ where: { companyId } }),
      this.prisma.restaurantTable.count({
        where: { companyId, status: 'FREE' },
      }),
      this.prisma.menuItem.count({ where: { companyId } }),
      this.prisma.menuItem.count({
        where: { companyId, isAvailable: false },
      }),
      this.prisma.tableReservation.count({
        where: {
          companyId,
          reservedAt: { gte: startOfDay },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
    ]);

    const todaySales = todayPaid.reduce(
      (s: number, o: any) => s + Number(o.total),
      0,
    );

    const guests = todayPaid.reduce(
      (s: number, o: any) => s + Number(o.guestCount ?? 0),
      0,
    );

    return {
      openOrders,
      todayOrders: todayPaid.length,
      todaySales,
      avgTicket: todayPaid.length
        ? Math.round(todaySales / todayPaid.length)
        : 0,
      guests,
      tables,
      freeTables,
      occupancyRate: tables
        ? Math.round(((tables - freeTables) / tables) * 100)
        : 0,
      menuCount,
      unavailableItems: unavailable,
      todayReservations,
    };
  }

  /** پرفروش‌ترین آیتم‌ها */
  async topItems(companyId: string, query: any = {}) {
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - 30 * 86400_000);

    const rows = await this.prisma.restaurantOrderItem.groupBy({
      by: ['menuItemId', 'name'],
      where: {
        order: { companyId, status: 'PAID', closedAt: { gte: from } },
        status: { not: 'CANCELLED' },
      },
      _sum: { qty: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: query.limit ? Number(query.limit) : 20,
    });

    return rows.map((r: any) => ({
      menuItemId: r.menuItemId,
      name: r.name,
      qty: Number(r._sum.qty ?? 0),
      revenue: Number(r._sum.total ?? 0),
    }));
  }

  /** رسید چاپی سفارش (RTL) */
  async printReceipt(companyId: string, id: string) {
    const order: any = await this.order(companyId, id);

    const fa = (n: any) => Number(n ?? 0).toLocaleString('fa-IR');

    const rows = order.items
      .map(
        (i: any, idx: number) =>
          `<tr><td>${idx + 1}</td><td>${i.name}${
            i.note ? `<br><small>${i.note}</small>` : ''
          }</td><td>${fa(i.qty)}</td><td>${fa(i.unitPrice)}</td><td>${fa(
            i.total,
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
      <div>${
        order.table ? `میز: ${order.table.tableNo}` : `نوع: ${order.type}`
      }</div>
    </div>
    <div>
      <div>${new Date(order.openedAt).toLocaleString('fa-IR')}</div>
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

  private async ensure(
    model: string,
    companyId: string,
    id: string,
    message: string,
  ) {
    const found = await (this.prisma as any)[model].findFirst({
      where: { id, companyId },
    });

    if (!found) throw new NotFoundException(message);

    return found;
  }

  /** ساخت اقلام سفارش با قیمت‌گذاری از منو */
  private async buildItems(companyId: string, items: OrderItemDto[]) {
    const ids = items
      .map((i) => i.menuItemId)
      .filter((v): v is string => Boolean(v));

    const menuItems = ids.length
      ? await this.prisma.menuItem.findMany({
          where: { id: { in: ids }, companyId },
        })
      : [];

    const map = new Map(menuItems.map((m: any) => [m.id, m]));

    if (menuItems.length !== new Set(ids).size) {
      throw new BadRequestException('برخی آیتم‌های منو یافت نشدند');
    }

    let subtotal = 0;

    const itemsData = items.map((i) => {
      const menu: any = i.menuItemId ? map.get(i.menuItemId) : null;

      if (menu && !menu.isAvailable) {
        throw new BadRequestException(`«${menu.name}» در حال حاضر موجود نیست`);
      }

      const name = menu?.name ?? i.name;

      if (!name) {
        throw new BadRequestException('نام قلم سفارش مشخص نیست');
      }

      const unitPrice = i.unitPrice ?? Number(menu?.price ?? 0);
      const discount = i.discount ?? 0;
      const total = Math.round((unitPrice * i.qty - discount) * 100) / 100;

      if (total < 0) {
        throw new BadRequestException(`تخفیف قلم «${name}» نامعتبر است`);
      }

      subtotal += total;

      return {
        menuItemId: i.menuItemId ?? null,
        name,
        qty: i.qty,
        unitPrice,
        discount,
        total,
        station: (menu?.station ?? 'KITCHEN') as never,
        note: i.note ?? null,
        status: 'PENDING' as never,
      };
    });

    return { itemsData, subtotal: Math.round(subtotal * 100) / 100 };
  }

  /** بازمحاسبه مبالغ سفارش پس از تغییر اقلام */
  private async recalc(orderId: string) {
    const order: any = await this.prisma.restaurantOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    const subtotal = order.items
      .filter((i: any) => i.status !== 'CANCELLED')
      .reduce((s: number, i: any) => s + Number(i.total), 0);

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

    return this.prisma.restaurantOrder.update({
      where: { id: orderId },
      data: {
        subtotal,
        serviceCharge,
        tax,
        total: net + serviceCharge + tax + Number(order.deliveryFee),
      },
      include: { items: true },
    });
  }

  /** همگام‌سازی وضعیت سفارش با وضعیت اقلام */
  private async syncOrderStatus(orderId: string) {
    const items = await this.prisma.restaurantOrderItem.findMany({
      where: { orderId, status: { not: 'CANCELLED' } },
      select: { status: true },
    });

    if (!items.length) return;

    const order = await this.prisma.restaurantOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (!order || ['PAID', 'CANCELLED'].includes(order.status)) return;

    const all = (s: string) => items.every((i: any) => i.status === s);

    const status = all('SERVED')
      ? 'SERVED'
      : items.every((i: any) => ['READY', 'SERVED'].includes(i.status))
        ? 'READY'
        : 'IN_KITCHEN';

    await this.prisma.restaurantOrder.update({
      where: { id: orderId },
      data: { status: status as never },
    });
  }

  /** کسر مواد اولیه از انبار طبق رسپی اقلام سفارش */
  private async consumeIngredients(tx: any, order: any, warehouseId: string) {
    const menuItemIds = order.items
      .filter((i: any) => i.menuItemId && i.status !== 'CANCELLED')
      .map((i: any) => i.menuItemId);

    if (!menuItemIds.length) return;

    const recipes = await tx.menuRecipe.findMany({
      where: { menuItemId: { in: menuItemIds } },
    });

    if (!recipes.length) return;

    // جمع مصرف هر ماده اولیه
    const usage = new Map<string, number>();

    for (const item of order.items) {
      if (!item.menuItemId || item.status === 'CANCELLED') continue;

      for (const r of recipes.filter(
        (x: any) => x.menuItemId === item.menuItemId,
      )) {
        const waste = 1 + Number(r.wastePct ?? 0) / 100;
        const qty = Number(r.qty) * Number(item.qty) * waste;
        usage.set(r.productId, (usage.get(r.productId) ?? 0) + qty);
      }
    }

    for (const [productId, qty] of usage) {
      const inventory = await tx.inventory.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } },
      });

      if (!inventory) continue;

      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: Number(inventory.quantity) - qty },
      });
    }
  }
}
