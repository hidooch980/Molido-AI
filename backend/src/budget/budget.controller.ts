import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BudgetService } from './budget.service';
import { BudgetCommitmentService } from './commitment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('بودجه')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('budget')
export class BudgetController {
  constructor(
    private readonly service: BudgetService,
    private readonly commitments: BudgetCommitmentService,
  ) {}

  // ---------- چرخهٔ اعتبار: تخصیص ← تعهد ← هزینهٔ قطعی ----------

  /** وضعیتِ یک ردیف: مصوب، تخصیص، تعهد، هزینه و اعتبارِ آزاد. */
  @Get('lines/:id/status')
  lineStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commitments.status(user.companyId!, id);
  }

  /** دفترِ تعهدهای یک ردیف — بابتِ چه و در چه وضعیتی. */
  @Get('lines/:id/commitments')
  ledger(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commitments.ledger(user.companyId!, id);
  }

  /**
   * ثبتِ تعهد.
   *
   * ⚠️ اگر از اعتبارِ آزاد رد شود **رد می‌شود**، نه هشدار.  هشدار را
   *    می‌شود نادیده گرفت و همیشه گرفته می‌شود.
   */
  @Post('lines/:id/commit')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  commit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { amount: number; sourceType: string; sourceId?: string; note?: string },
  ) {
    return this.commitments.commit(user.companyId!, id, {
      ...dto,
      userId: user.userId,
    });
  }

  /** قطعی کردن — مبلغِ کمتر از تعهد، مابه‌التفاوت را آزاد می‌کند. */
  @Post('commitments/:id/settle')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  settle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { actualAmount?: number },
  ) {
    return this.commitments.settle(user.companyId!, id, dto?.actualAmount);
  }

  /** آزادسازی — قرارداد لغو شد و اعتبار برمی‌گردد. */
  @Post('commitments/:id/release')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  release(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commitments.release(user.companyId!, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!!);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.findAll(user.companyId!, q);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.create(user.companyId!, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId!, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.update(user.companyId!, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.companyId!, id);
  }
}
