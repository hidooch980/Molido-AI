import { Module } from '@nestjs/common';

import { TechnicalOfficeController } from './technical-office.controller';
import { TechnicalOfficeService } from './technical-office.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
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
