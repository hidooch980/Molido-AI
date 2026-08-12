import { Module } from '@nestjs/common';

import { TechnicalOfficeController } from './technical-office.controller';
import { TechnicalOfficeService } from './technical-office.service';


@Module({
  imports: [
    ],
  controllers: [
    TechnicalOfficeController,
  ],
  providers: [
    TechnicalOfficeService,
  ],
  exports: [
    TechnicalOfficeService,
  ],
})
export class TechnicalOfficeModule {}
