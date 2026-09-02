import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
// ⚠️ بدونِ این، وصولِ مشتری دوباره بی‌سند می‌شود و مطالبات هرگز تسویه
//    نمی‌شود.
import { AccountingModule } from '../accounting/accounting.module';


@Module({
  imports: [
    AccountingModule,
  ],
  controllers: [
    PaymentsController,
  ],
  providers: [
    PaymentsService,
  ],
  exports: [
    PaymentsService,
  ],
})
export class PaymentsModule {}
