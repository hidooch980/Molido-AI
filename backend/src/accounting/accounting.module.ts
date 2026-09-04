import { Global, Module } from '@nestjs/common';

import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { PostingService } from './posting.service';
import { JournalTemplateController } from './journal-template.controller';
import { JournalTemplateService } from './journal-template.service';

/**
 * @Global() — هر زیرسیستمی که رویداد مالی دارد (فروش، خرید، دریافت وجه،
 * حقوق) باید بتواند بدون import مستقیم سند بزند.
 */
@Global()
@Module({
  controllers: [AccountingController, LedgerController, JournalTemplateController],
  providers: [AccountingService, LedgerService, PostingService, JournalTemplateService],
  exports: [AccountingService, LedgerService, PostingService, JournalTemplateService],
})
export class AccountingModule {}
