import { Module } from '@nestjs/common';

import { CashBoxController } from './cashbox.controller';
import { CashBoxService } from './cashbox.service';
// ⚠️ بدونِ این، واریز و برداشت دوباره بی‌سند می‌شوند.
import { AccountingModule } from '../accounting/accounting.module';


@Module({
  imports: [
    AccountingModule,
  ],
  controllers: [
    CashBoxController,
  ],
  providers: [
    CashBoxService,
  ],
  exports: [
    CashBoxService,
  ],
})
export class CashBoxModule {}
