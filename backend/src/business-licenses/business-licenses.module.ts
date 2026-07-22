import { Module } from '@nestjs/common';
import { BusinessLicensesService } from './business-licenses.service';
import { BusinessLicensesController } from './business-licenses.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessLicensesController],
  providers: [BusinessLicensesService],
  exports: [BusinessLicensesService],
})
export class BusinessLicensesModule {}
