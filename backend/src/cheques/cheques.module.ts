import { Module } from '@nestjs/common';

import { ChequesController } from './cheques.controller';
import { ChequesService } from './cheques.service';
import { ChequePrintController } from './cheque-print.controller';
import { ChequePrintService } from './cheque-print.service';


@Module({
  imports: [
    ],
  controllers: [
    ChequesController,
    ChequePrintController,
  ],
  providers: [
    ChequesService,
    ChequePrintService,
  ],
  exports: [
    ChequesService,
    ChequePrintService,
  ],
})
export class ChequesModule {}
