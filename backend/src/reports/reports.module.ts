import { Module } from '@nestjs/common';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';


@Module({
  imports: [
    ],
  controllers: [
    ReportsController,
  ],
  providers: [
    ReportsService,
  ],
  exports: [
    ReportsService,
  ],
})
export class ReportsModule {}
