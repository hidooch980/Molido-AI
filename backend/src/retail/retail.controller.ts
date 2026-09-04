import {
  BadRequestException,
  Body,
  Delete,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CashierShiftService } from './cashier-shift.service';
import { ParkedSaleService } from './parked-sale.service';
import { ScanService } from './scan.service';
import { QuickKeysService } from './quick-keys.service';
import {
  QuickKeyDto,
  QuickKeyGroupDto,
  ReorderQuickKeysDto,
  UpdateQuickKeyGroupDto,
} from './dto/quick-keys.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const CASHIER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'SALES'] as const;

@Controller('retail')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RetailController {
  constructor(
    private readonly shifts: CashierShiftService,
    private readonly scanner: ScanService,
    private readonly parked: ParkedSaleService,
    private readonly quickKeys: QuickKeysService,
  ) {}

  // ---------- کلید سریع ----------
  //
  // چیدمان را فروشنده تعیین می‌کند، نه برنامه‌نویس: هر فروشگاه
  // پرفروش‌های خودش را دارد و هیچ پیش‌فرضی برای همه درست نیست.

  /** چیدمان کامل برای صندوق — گروه‌ها با کلیدهایشان، یک درخواست. */
  @Get('quick-keys')
  @Roles(...CASHIER_ROLES)
  quickKeyLayout(@CurrentUser() user: AuthUser) {
    return this.quickKeys.layout(user.companyId as string);
  }

  @Get('quick-keys/groups')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  quickKeyGroups(@CurrentUser() user: AuthUser) {
    return this.quickKeys.groups(user.companyId as string);
  }

  @Post('quick-keys/groups')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createQuickKeyGroup(@CurrentUser() user: AuthUser, @Body() dto: QuickKeyGroupDto) {
    return this.quickKeys.createGroup(user.companyId as string, dto);
  }

  @Patch('quick-keys/groups/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  updateQuickKeyGroup(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateQuickKeyGroupDto,
  ) {
    return this.quickKeys.updateGroup(user.companyId as string, id, dto);
  }

  @Delete('quick-keys/groups/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  removeQuickKeyGroup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quickKeys.removeGroup(user.companyId as string, id);
  }

  @Post('quick-keys')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  addQuickKey(@CurrentUser() user: AuthUser, @Body() dto: QuickKeyDto) {
    return this.quickKeys.addKey(user.companyId as string, dto);
  }

  @Post('quick-keys/reorder')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  reorderQuickKeys(@CurrentUser() user: AuthUser, @Body() dto: ReorderQuickKeysDto) {
    return this.quickKeys.reorder(user.companyId as string, dto.items);
  }

  @Delete('quick-keys/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  removeQuickKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quickKeys.removeKey(user.companyId as string, id);
  }

  // ---------- فاکتور معلق ----------

  /**
   * سبدهای کنارگذاشته‌شده.
   *
   * همهٔ صندوق‌داران یک فروشگاه یک فهرست می‌بینند: مشتری ممکن است
   * سراغ صندوق دیگری برود، و سبدی که فقط برای یک نفر دیده شود، برای
   * او گم شده است.
   */
  @Get('parked')
  listParked(@CurrentUser() user: AuthUser) {
    return this.parked.list(user.companyId as string);
  }

  @Post('parked')
  park(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      lines: Array<{ productId: string; quantity: number; name?: string; price?: number }>;
      label?: string;
      customerId?: string;
      shiftId?: string;
      note?: string;
    },
  ) {
    return this.parked.park(user.companyId as string, user.userId, dto);
  }

  /** بازیابی سبد؛ قیمت‌ها دوباره از سرور گرفته می‌شوند. */
  @Post('parked/:id/resume')
  resumeParked(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parked.resume(user.companyId as string, id);
  }

  @Delete('parked/:id')
  removeParked(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parked.remove(user.companyId as string, id);
  }

  // ---------- اسکن ----------

  /** یک اسکن را به سطر فاکتور تبدیل می‌کند (بارکد کالا، برچسب ترازو یا SKU). */
  @Get('scan')
  @Roles(...CASHIER_ROLES)
  scan(
    @CurrentUser() user: AuthUser,
    @Query('code') code: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.scanner.scan(user.companyId as string, code, { warehouseId });
  }

  /**
   * جست‌وجوی کالا با نام، کد یا بارکد.
   *
   * نبودنِ `q` خطاست، ولی `q=` خالی نه.
   *
   * تفاوتشان مهم است: جعبهٔ جست‌وجوی خالی در رابط، `q=` می‌فرستد و
   * باید فهرست خالی بگیرد.  ولی فراخوانی که اصلاً `q` ندارد، اشتباهِ
   * نویسندهٔ آن فراخوان است — و اگر آرایهٔ خالی بگیرد، ساعت‌ها به
   * دنبال «چرا چیزی پیدا نمی‌شود» می‌گردد.  همین یک بار پیش آمد.
   */
  @Get('search')
  @Roles(...CASHIER_ROLES)
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') term: string | undefined,
    @Query('limit') limit?: string,
  ) {
    if (term === undefined) {
      throw new BadRequestException('پارامتر q لازم است');
    }

    return this.scanner.search(
      user.companyId as string,
      term,
      limit ? Number(limit) : undefined,
    );
  }

  // ---------- شیفت صندوق ----------

  /** شیفت باز خود صندوق‌دار — صفحهٔ صندوق با این شروع می‌شود. */
  @Get('shifts/current')
  @Roles(...CASHIER_ROLES)
  current(@CurrentUser() user: AuthUser) {
    return this.shifts.current(user.companyId as string, user.userId);
  }

  @Get('shifts')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('cashBoxId') cashBoxId?: string,
    @Query('open') open?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shifts.findAll(user.companyId as string, {
      userId,
      cashBoxId,
      open: open === undefined ? undefined : open === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('shifts/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shifts.findOne(user.companyId as string, id);
  }

  @Post('shifts/open')
  @Roles(...CASHIER_ROLES)
  open(
    @Body()
    body: { cashBoxId: string; warehouseId?: string; openingCash?: number; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.shifts.open(user.companyId as string, user.userId, body);
  }

  @Patch('shifts/:id/close')
  @Roles(...CASHIER_ROLES)
  close(
    @Param('id') id: string,
    @Body() body: { countedCash?: number; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.shifts.close(user.companyId as string, id, user.userId, body);
  }
}
