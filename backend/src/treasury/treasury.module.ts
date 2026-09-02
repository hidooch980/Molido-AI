import { Module } from '@nestjs/common';

import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';
// ⚠️ بدونِ این، واریز و برداشتِ خزانه دوباره بی‌سند می‌شوند.
import { AccountingModule } from '../accounting/accounting.module';


@Module({
  imports: [AccountingModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
