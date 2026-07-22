import { Module } from '@nestjs/common';

import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
