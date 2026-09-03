import { Module } from '@nestjs/common';

import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';
import { PettyCashController } from './petty-cash.controller';
import { PettyCashService } from './petty-cash.service';
// ⚠️ بدونِ این، واریز و برداشتِ خزانه دوباره بی‌سند می‌شوند.
import { AccountingModule } from '../accounting/accounting.module';


@Module({
  imports: [AccountingModule],
  controllers: [TreasuryController, PettyCashController],
  providers: [TreasuryService, PettyCashService],
  exports: [TreasuryService, PettyCashService],
})
export class TreasuryModule {}
