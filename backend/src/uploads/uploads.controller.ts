import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const UPLOAD_DIR = './uploads';

/**
 * پسوندهای مجاز — **فهرست سفید**، نه سیاه.
 *
 * ⚠️ این محدودیت با آزمونِ واقعی گذاشته شد، نه از روی احتیاط.
 *
 *    پیش از این هیچ صافی‌ای نبود.  زنجیرهٔ حمله ساخته و در مرورگر
 *    اجرا شد:
 *
 *      ۱) کاربرِ واردشده — **هر نقشی، حتی کارمند** — یک `payload.js`
 *         آپلود می‌کند
 *      ۲) و یک `loader.html` که آن را صدا می‌زند
 *      ۳) لینکِ `/uploads/…html` را به مدیر می‌دهد
 *      ۴) مدیر بازش می‌کند و اسکریپت در **دامنهٔ برنامه** اجرا می‌شود
 *      ۵) `localStorage.molido_token` خوانده می‌شود -> حساب ربوده شد
 *
 *    `helmet` سیاست CSP می‌گذارد ولی `script-src 'self'` است — و
 *    `/uploads/` هم «self» است.  یعنی CSP اسکریپتِ درون‌خطی را
 *    می‌بست ولی اسکریپتِ آپلودشده را نه.  عنوانِ تب واقعاً عوض شد.
 *
 * فهرست سیاه («html و js را نپذیر») کافی نیست: `.htm`, `.xhtml`,
 * `.svg`, `.mjs`, `.xml` و هر چیزِ تازه‌ای که مرورگرها فردا اجرا کنند
 * از قلمش می‌افتد.  فهرست سفید فقط چیزی را می‌پذیرد که می‌دانیم امن
 * است.
 */
const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp',
  '.pdf',
  '.csv', '.txt',
  '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx',
  '.zip',
  '.mp3', '.wav', '.ogg', '.m4a', '.webm', '.mp4',
]);

/**
 * ⚠️ `.svg` عمداً **نیست**.
 *
 *    SVG تصویر به نظر می‌رسد ولی XML است و `<script>` می‌پذیرد.  در
 *    فهرستِ تصویرها گذاشتنش، همان حفره را از درِ دیگر باز می‌کند.
 */

/** نوعِ اعلام‌شدهٔ مرورگر هم باید بخواند — نه به‌جای پسوند، در کنارش. */
const ALLOWED_MIME = /^(image\/(jpeg|png|gif|webp|avif|bmp)|application\/(pdf|zip|vnd\.|msword|octet-stream)|text\/(plain|csv)|audio\/|video\/)/;

const storage = diskStorage({
  destination: (
    _req: unknown,
    _file: unknown,
    cb: (error: Error | null, destination: string) => void,
  ) => {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    cb(null, UPLOAD_DIR);
  },
  filename: (
    _req: unknown,
    file: { originalname: string },
    cb: (error: Error | null, filename: string) => void,
  ) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * آپلود فایل (multipart/form-data با فیلد `file`)
   *
   * entityType/entityId اختیاری است برای اتصال به موجودیت‌ها
   * (مثلاً entityType=BUILDING_PERMIT و entityId=شناسه پروانه)
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (
        _req: unknown,
        file: { originalname: string; mimetype: string },
        cb: (error: Error | null, accept: boolean) => void,
      ) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
          // پیام پسوند را می‌گوید: کاربری که فایل درستی دارد باید
          // بفهمد چرا رد شد، نه اینکه حدس بزند.
          cb(new BadRequestException(`پسوند «${ext || '—'}» پذیرفته نمی‌شود`), false);
          return;
        }
        if (file.mimetype && !ALLOWED_MIME.test(file.mimetype)) {
          cb(new BadRequestException(`نوع فایل «${file.mimetype}» پذیرفته نمی‌شود`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @UploadedFile() file: {
      originalname: string;
      filename: string;
      mimetype?: string;
      size?: number;
    },
    @Body() body: { entityType?: string; entityId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploadsService.saveAttachment(
      user.companyId as string,
      file ?? null,
      body,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.uploadsService.findAll(user.companyId as string, {
      entityType,
      entityId,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.uploadsService.remove(id, user.companyId as string);
  }
}
