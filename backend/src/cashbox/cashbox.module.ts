import { Module } from '@nestjs/common';

import { CashBoxController } from './cashbox.controller';
import { CashBoxService } from './cashbox.service';


@Module({
  imports: [
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
