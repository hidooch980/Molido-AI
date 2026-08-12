import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { StockCountService } from './stock-count.service';
import { StockCountController } from './stock-count.controller';
import { InventoryService } from './inventory.service';


@Module({
  imports: [
    ],
  controllers: [
    InventoryController,
    StockCountController,
  ],
  providers: [
    InventoryService,
    StockCountService,
  ],
  exports: [
    InventoryService,
    StockCountService,
  ],
})
export class InventoryModule {}
