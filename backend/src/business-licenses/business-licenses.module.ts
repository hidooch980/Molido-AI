import { Module } from '@nestjs/common';
import { BusinessLicensesService } from './business-licenses.service';
import { BusinessLicensesController } from './business-licenses.controller';

@Module({
  controllers: [BusinessLicensesController],
  providers: [BusinessLicensesService],
  exports: [BusinessLicensesService],
})
export class BusinessLicensesModule {}
