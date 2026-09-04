import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ProductsService } from './products.service';
import { ImportService } from './import.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly importService: ImportService,
  ) {}

  /**
   * پیش‌نمایش فایل — بدون نوشتن.
   *
   * اجباری است: فایلی که ستون‌هایش اشتباه تشخیص داده شده، هزاران
   * کالای خراب می‌سازد و پاک کردنشان از خودِ ورود سخت‌تر است.
   */
  @Post('import/preview')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  previewImport(
    @CurrentUser() user: AuthUser,
    @Body() dto: { csv: string },
  ) {
    return this.importService.preview(user.companyId as string, dto?.csv);
  }

  @Post('import')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  runImport(
    @CurrentUser() user: AuthUser,
    @Body() dto: { csv: string; warehouseId?: string; updateExisting?: boolean },
  ) {
    return this.importService.run(user.companyId as string, dto?.csv, {
      warehouseId: dto?.warehouseId,
      updateExisting: dto?.updateExisting,
    });
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.findAll(user.companyId as string, {
      search,
      categoryId,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('barcode/:barcode')
  findByBarcode(
    @Param('barcode') barcode: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.findByBarcode(
      barcode,
      user.companyId as string,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.productsService.findOne(id, user.companyId as string);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.productsService.create(dto, user.companyId as string);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.update(id, dto, user.companyId as string);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.productsService.remove(id, user.companyId as string);
  }
}
