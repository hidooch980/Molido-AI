import { Module } from '@nestjs/common';

import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';


@Module({
  imports: [
    ],
  controllers: [
    SalesController,
  ],
  providers: [
    SalesService,
  ],
  exports: [
    SalesService,
  ],
})
export class SalesModule {}
