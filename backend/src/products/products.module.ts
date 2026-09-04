import { Module } from '@nestjs/common';

import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ImportService } from './import.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ImportService],
  exports: [ProductsService, ImportService],
})
export class ProductsModule {}
