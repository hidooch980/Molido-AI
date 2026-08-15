import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { DIALECT_LABELS, DIALECTS, VoiceService, scopeOf } from './voice.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import {
  AddSampleDto,
  ImportDictionaryDto,
  ReviewSampleDto,
  ScopeQueryDto,
  SetTargetDto,
} from './dto/voice.dto';

/**
 * ساختن پیکره کار مدیر است؛ **ضبط کردن** کار هر فروشنده‌ای.
 *
 * اگر ضبط هم مدیر لازم داشته باشد، پیکره هیچ‌وقت به سه گوینده نمی‌رسد —
 * چون فروشگاه یک مدیر دارد.
 */
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] as const;
const RECORDER_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'WAREHOUSE',
] as const;

@Controller('voice')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** گویش‌های موجود — تا رابط کاربری فهرست را از سرور بگیرد نه از خودش. */
  @Get('dialects')
  @Roles(...RECORDER_ROLES)
  dialects() {
    return DIALECTS.map((code) => ({ code, label: DIALECT_LABELS[code] }));
  }

  // ------------------------------------------------------- عبارت‌ها

  @Get('phrases')
  @Roles(...RECORDER_ROLES)
  phrases(@CurrentUser() user: AuthUser, @Query() q: ScopeQueryDto) {
    return this.voice.phrases(scopeOf(user.companyId as string, q.lang, q.dialect));
  }

  /** ساخت فهرست ضبط از کالاهای فروشگاه + اعداد + فرمان‌ها. */
  @Post('phrases/build')
  @Roles(...ADMIN_ROLES)
  build(@CurrentUser() user: AuthUser, @Query() q: ScopeQueryDto) {
    return this.voice.buildPhrases(scopeOf(user.companyId as string, q.lang, q.dialect));
  }

  @Patch('phrases/:id')
  @Roles(...ADMIN_ROLES)
  setTarget(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetTargetDto,
  ) {
    return this.voice.setTarget(user.companyId as string, id, dto.textTarget);
  }

  /**
   * پیشنهاد املای بلوچی — فقط پیشنهاد.
   *
   * چیزی ذخیره نمی‌شود؛ بازبین باید هرکدام را با `PATCH` تأیید کند.
   */
  @Get('phrases/suggest')
  @Roles(...ADMIN_ROLES)
  suggest(@CurrentUser() user: AuthUser, @Query() q: ScopeQueryDto) {
    return this.voice.suggestTargets(
      scopeOf(user.companyId as string, q.lang, q.dialect),
    );
  }

  // ------------------------------------------------------- واژه‌نامه

  @Post('dictionary')
  @Roles(...ADMIN_ROLES)
  importDictionary(@CurrentUser() user: AuthUser, @Body() dto: ImportDictionaryDto) {
    return this.voice.importDictionary(
      scopeOf(user.companyId as string, dto.lang, dto.dialect),
      dto.csv,
    );
  }

  // ------------------------------------------------------------ ضبط

  @Post('samples')
  @Roles(...RECORDER_ROLES)
  addSample(@CurrentUser() user: AuthUser, @Body() dto: AddSampleDto) {
    return this.voice.addSample(
      user.companyId as string,
      user.userId as string,
      dto,
    );
  }

  @Get('samples/pending')
  @Roles(...ADMIN_ROLES)
  pending(@CurrentUser() user: AuthUser, @Query() q: ScopeQueryDto) {
    return this.voice.pendingSamples(
      scopeOf(user.companyId as string, q.lang, q.dialect),
    );
  }

  @Patch('samples/:id')
  @Roles(...ADMIN_ROLES)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewSampleDto,
  ) {
    return this.voice.reviewSample(
      user.companyId as string,
      id,
      dto.approved,
      dto.reason,
    );
  }

  // -------------------------------------------------------- آمادگی

  @Get('status')
  @Roles(...RECORDER_ROLES)
  status(@CurrentUser() user: AuthUser, @Query() q: ScopeQueryDto) {
    return this.voice.status(scopeOf(user.companyId as string, q.lang, q.dialect));
  }

  @Get('manifest')
  @Roles(...ADMIN_ROLES)
  manifest(@CurrentUser() user: AuthUser, @Query() q: ScopeQueryDto) {
    return this.voice.exportManifest(
      scopeOf(user.companyId as string, q.lang, q.dialect),
    );
  }
}
