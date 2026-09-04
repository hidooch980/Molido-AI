import { Global, Module } from '@nestjs/common';
import { ParkedSaleService } from './parked-sale.service';
import { ScanService } from './scan.service';
import { QuickKeysService } from './quick-keys.service';
import { RetailController } from './retail.controller';

/**
 * صندوق فروشگاهی: اسکن بارکد و کالای وزنی.
 *
 * شیفت صندوق‌دار در `CashierShiftModule` است، چون فروش به آن نیاز دارد حتی در
 * محصولی که صندوق فروشگاهی ندارد.
 */
@Global()
@Module({
  controllers: [RetailController],
  providers: [ScanService, ParkedSaleService, QuickKeysService],
  exports: [ScanService, ParkedSaleService, QuickKeysService],
})
export class RetailModule {}
