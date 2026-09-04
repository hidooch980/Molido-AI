import { Module } from '@nestjs/common';

import { SalesModule } from '../sales/sales.module';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesChainService } from './sales-chain.service';
import { SalesChainController } from './sales-chain.controller';

// زنجیرهٔ فروش برای صدور فاکتور به SalesService تکیه می‌کند، پس SalesModule
// باید import شود — وگرنه Nest هنگام بالا آمدن نمی‌تواند وابستگی را حل کند.
@Module({
  imports: [SalesModule],
  controllers: [SalesOrdersController, SalesChainController],
  providers: [SalesOrdersService, SalesChainService],
  exports: [SalesOrdersService, SalesChainService],
})
export class SalesOrdersModule {}
