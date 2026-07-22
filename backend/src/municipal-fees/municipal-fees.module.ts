import { Module } from '@nestjs/common';

import { MunicipalFeesController } from './municipal-fees.controller';
import { MunicipalFeesService } from './municipal-fees.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
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
