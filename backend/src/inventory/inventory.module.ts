import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { StockCountService } from './stock-count.service';
import { StockCountController } from './stock-count.controller';
import { InventoryService } from './inventory.service';
import { ConsignmentController } from './consignment.controller';
import { ConsignmentService } from './consignment.service';


@Module({
  imports: [
    ],
  controllers: [
    InventoryController,
    StockCountController,
    ConsignmentController,
  ],
  providers: [
    InventoryService,
    StockCountService,
    ConsignmentService,
  ],
  exports: [
    InventoryService,
    StockCountService,
    ConsignmentService,
  ],
})
export class InventoryModule {}
