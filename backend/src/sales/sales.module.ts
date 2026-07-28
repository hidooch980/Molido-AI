import { Module } from '@nestjs/common';

import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

import { PrismaModule } from '../prisma/prisma.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    PrismaModule,
    // برای ثبت خودکار امتیاز وفاداری هنگام ثبت فاکتور
    CrmModule,
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
