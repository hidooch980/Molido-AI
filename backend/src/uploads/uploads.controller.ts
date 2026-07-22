import {
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
