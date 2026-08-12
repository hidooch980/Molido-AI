import { Module } from '@nestjs/common';

import { MunicipalFeesController } from './municipal-fees.controller';
import { MunicipalFeesService } from './municipal-fees.service';


@Module({
  imports: [
    ],
  controllers: [
    MunicipalFeesController,
  ],
  providers: [
    MunicipalFeesService,
  ],
  exports: [
    MunicipalFeesService,
  ],
})
export class MunicipalFeesModule {}
