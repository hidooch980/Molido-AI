import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * ⚠️ `@Roles` اینجا از یک بازرسی آمد، نه از طراحی اولیه.
   *
   *    این مسیر هیچ محافظی نداشت.  در آزمون زنده، کاربرِ نقشِ
   *    EMPLOYEE فهرستِ کاملِ همکارانش را گرفت: **ایمیل، تلفن، نقش و
   *    وضعیت** — از جمله ایمیل و نقشِ مدیر.
   *
   *    این «فقط افشای اطلاعات» نیست: نشانیِ ایمیلِ مدیر و دانستنِ
   *    اینکه او مدیر است، دقیقاً همان چیزی است که یک فیشینگِ هدفمند
   *    لازم دارد.  و کسی که حسابِ کارمند را با رمزِ ضعیف به دست
   *    آورده، همین را می‌خواهد.
   *
   *    تنها مصرف‌کنندهٔ این مسیر صفحهٔ مدیریت کاربران است، که خودش
   *    فقط برای مدیر باز می‌شود — پس بستنش چیزی را نمی‌شکند.
   */
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  findAll(@CurrentUser() user: AuthUser) {
    return this.usersService.findAll(user.companyId);
  }

  /**
   * ⚠️ فیلترِ شرکت اینجا در SQL نیست — RLS آن را می‌دهد.
   *
   *    آزموده شد: کاربرِ شرکت ۱ با شناسهٔ کاربرِ شرکت ۲، ۴۰۴ گرفت.
   *
   *    ولی تکیهٔ **تنها** بر RLS شکننده است: هر مسیری که بیرون از
   *    زمینهٔ شرکت اجرا شود، این محافظ را ندارد.  `@Roles` لایهٔ
   *    دومش است.
   */
  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, user.companyId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
