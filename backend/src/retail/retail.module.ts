import { Global, Module } from '@nestjs/common';
import { ScanService } from './scan.service';
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
  providers: [ScanService],
  exports: [ScanService],
})
export class RetailModule {}
