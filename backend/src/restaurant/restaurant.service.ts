import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const OPEN_ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'SERVED'];

@Injectable()
export class RestaurantService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== میزها (Tables) ====================

  async findTables(companyId: string, query: any = {}) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    if (query.hall) where.hall = query.hall;
    return this.prisma.diningTable.findMany({ where, orderBy: { tableNo: 'asc' } });
  }

  async findTable(companyId: string, id: string) {
    const item = await this.prisma.diningTable.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('میز یافت نشد');
    return item;
  }

  async createTable(companyId: string, data: any) {
    return this.prisma.diningTable.create({ data: { ...data, companyId } });
  }

  async updateTable(companyId: string, id: string, data: any) {
    await this.findTable(companyId, id);
    return this.prisma.diningTable.update({ where: { id }, data });
  }

  async removeTable(companyId: string, id: string) {
    await this.findTable(companyId, id);
    return this.prisma.diningTable.delete({ where: { id } });
  }

  // ==================== دسته‌بندی منو (Menu Categories) ====================

  async findMenuCategories(companyId: string) {
    return this.prisma.menuCategory.findMany({
      where: { companyId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async createMenuCategory(companyId: string, data: any) {
    return this.prisma.menuCategory.create({ data: { ...data, companyId } });
  }

  async updateMenuCategory(companyId: string, id: string, data: any) {
    const item = await this.prisma.menuCategory.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('دسته‌بندی منو یافت نشد');
    return this.prisma.menuCategory.update({ where: { id }, data });
  }

  async removeMenuCategory(companyId: string, id: string) {
    const item = await this.prisma.menuCategory.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('دسته‌بندی منو یافت نشد');
    return this.prisma.menuCategory.delete({ where: { id } });
  }

  // ==================== آیتم‌های منو (Menu Items) ====================

  async findMenuItems(companyId: string, query: any = {}) {
    const where: any = { companyId };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.isAvailable !== undefined) where.isAvailable = query.isAvailable === 'true';
    if (query.search) where.name = { contains: query.search };
    return this.prisma.menuItem.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
      take: query.limit ? Number(query.limit) : 100,
    });
  }

  async findMenuItem(companyId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, companyId },
      include: { category: true },
    });
    if (!item) throw new NotFoundException('آیتم منو یافت نشد');
    return item;
  }

  async createMenuItem(companyId: string, data: any) {
    return this.prisma.menuItem.create({ data: { ...data, companyId } });
  }

  async updateMenuItem(companyId: string, id: string, data: any) {
    await this.findMenuItem(companyId, id);
    return this.prisma.menuItem.update({ where: { id }, data });
  }

  async removeMenuItem(companyId: string, id: string) {
    await this.findMenuItem(companyId, id);
    return this.prisma.menuItem.delete({ where: { id } });
  }

  // ==================== سفارش‌ها (Orders) ====================

  async findOrders(companyId: string, query: any = {}) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.tableId) where.tableId = query.tableId;
    if (query.open === 'true') where.status = { in: OPEN_ORDER_STATUSES };
    return this.prisma.restaurantOrder.findMany({
      where,
      include: { items: true, table: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async findOrder(companyId: string, id: string) {
    const order = await this.prisma.restaurantOrder.findFirst({
      where: { id, companyId },
      include: { items: { include: { menuItem: true } }, table: true },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return order;
  }

  async createOrder(companyId: string, data: any) {
    const items: any[] = data.items || [];
    if (!items.length) throw new BadRequestException('سفارش باید حداقل یک آیتم داشته باشد');

    // قیمت و نام آیتم‌ها از منو خوانده می‌شود
    const lines: any[] = [];
    for (const item of items) {
      let name = item.name;
      let unitPrice = Number(item.unitPrice ?? 0);
      if (item.menuItemId) {
        const menuItem = await this.prisma.menuItem.findFirst({
          where: { id: item.menuItemId, companyId },
        });
        if (!menuItem) throw new NotFoundException('آیتم منو یافت نشد');
        if (!menuItem.isAvailable) {
          throw new BadRequestException(`آیتم «${menuItem.name}» در حال حاضر موجود نیست`);
        }
        name = name || menuItem.name;
        unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : Number(menuItem.price);
      }
      if (!name) throw new BadRequestException('نام آیتم سفارش الزامی است');
      const qty = Number(item.qty || 1);
      lines.push({
        menuItemId: item.menuItemId || null,
        name,
        qty,
        unitPrice,
        total: qty * unitPrice,
        note: item.note || null,
      });
    }

    const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
    const discount = Number(data.discount || 0);
    const tax = Number(data.tax || 0);
    const serviceCharge = Number(data.serviceCharge || 0);
    const total = subtotal - discount + tax + serviceCharge;

    const order = await this.prisma.restaurantOrder.create({
      data: {
        companyId,
        orderNo: data.orderNo || `R-${Date.now()}`,
        tableId: data.tableId || null,
        type: data.type || 'DINE_IN',
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        deliveryAddress: data.deliveryAddress,
        guests: data.guests ? Number(data.guests) : 1,
        subtotal,
        discount,
        tax,
        serviceCharge,
        total,
        note: data.note,
        items: { create: lines },
      },
      include: { items: true, table: true },
    });

    // میز به وضعیت «اشغال» می‌رود
    if (order.tableId) {
      await this.prisma.diningTable.update({
        where: { id: order.tableId },
        data: { status: 'OCCUPIED' },
      });
    }

    return order;
  }

  async updateOrderStatus(companyId: string, id: string, status: string) {
    if (!status) throw new BadRequestException('وضعیت سفارش الزامی است');
    const order = await this.findOrder(companyId, id);
    const updated = await this.prisma.restaurantOrder.update({
      where: { id },
      data: { status: status as any },
    });

    // با تسویه یا لغو سفارش، در صورت نبود سفارش باز دیگر، میز آزاد می‌شود
    if (order.tableId && (status === 'PAID' || status === 'CANCELLED')) {
      const openCount = await this.prisma.restaurantOrder.count({
        where: { tableId: order.tableId, status: { in: OPEN_ORDER_STATUSES as any } },
      });
      if (openCount === 0) {
        await this.prisma.diningTable.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    return updated;
  }

  async removeOrder(companyId: string, id: string) {
    await this.findOrder(companyId, id);
    return this.prisma.restaurantOrder.delete({ where: { id } });
  }

  // ==================== رزرو میز (Reservations) ====================

  async findReservations(companyId: string, query: any = {}) {
    const where: any = { companyId };
    if (query.status) where.status = query.status;
    if (query.tableId) where.tableId = query.tableId;
    return this.prisma.tableReservation.findMany({
      where,
      include: { table: true },
      orderBy: { reservedAt: 'asc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async createReservation(companyId: string, data: any) {
    if (!data.tableId) throw new BadRequestException('انتخاب میز الزامی است');
    if (!data.reservedAt) throw new BadRequestException('زمان رزرو الزامی است');
    await this.findTable(companyId, data.tableId);
    return this.prisma.tableReservation.create({
      data: {
        companyId,
        tableId: data.tableId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        reservedAt: new Date(data.reservedAt),
        guests: data.guests ? Number(data.guests) : 2,
        note: data.note,
      },
      include: { table: true },
    });
  }

  async updateReservation(companyId: string, id: string, data: any) {
    const item = await this.prisma.tableReservation.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('رزرو یافت نشد');
    if (data.reservedAt) data.reservedAt = new Date(data.reservedAt);
    return this.prisma.tableReservation.update({ where: { id }, data });
  }

  async removeReservation(companyId: string, id: string) {
    const item = await this.prisma.tableReservation.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('رزرو یافت نشد');
    return this.prisma.tableReservation.delete({ where: { id } });
  }

  // ==================== آمار (Stats) ====================

  async stats(companyId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [totalTables, availableTables, openOrders, todayOrders, todayPaid, activeMenuItems] =
      await Promise.all([
        this.prisma.diningTable.count({ where: { companyId, isActive: true } }),
        this.prisma.diningTable.count({
          where: { companyId, isActive: true, status: 'AVAILABLE' },
        }),
        this.prisma.restaurantOrder.count({
          where: { companyId, status: { in: OPEN_ORDER_STATUSES as any } },
        }),
        this.prisma.restaurantOrder.count({
          where: { companyId, createdAt: { gte: startOfDay } },
        }),
        this.prisma.restaurantOrder.aggregate({
          where: { companyId, status: 'PAID', createdAt: { gte: startOfDay } },
          _sum: { total: true },
        }),
        this.prisma.menuItem.count({ where: { companyId, isAvailable: true } }),
      ]);

    return {
      totalTables,
      availableTables,
      occupiedTables: totalTables - availableTables,
      openOrders,
      todayOrders,
      todaySales: todayPaid._sum.total || 0,
      activeMenuItems,
    };
  }
}
