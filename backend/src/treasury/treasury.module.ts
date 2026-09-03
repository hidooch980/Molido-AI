import { Module } from '@nestjs/common';

import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';
import { PettyCashController } from './petty-cash.controller';
import { PettyCashService } from './petty-cash.service';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
// ⚠️ بدونِ این، واریز و برداشتِ خزانه دوباره بی‌سند می‌شوند.
import { AccountingModule } from '../accounting/accounting.module';


@Module({
  imports: [AccountingModule],
  controllers: [TreasuryController, PettyCashController, ReconciliationController],
  providers: [TreasuryService, PettyCashService, ReconciliationService],
  exports: [TreasuryService, PettyCashService, ReconciliationService],
})
export class TreasuryModule {}
