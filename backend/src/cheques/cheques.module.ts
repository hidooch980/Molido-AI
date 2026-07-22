import { Module } from '@nestjs/common';

import { ChequesController } from './cheques.controller';
import { ChequesService } from './cheques.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    ChequesController,
  ],
  providers: [
    ChequesService,
  ],
  exports: [
    ChequesService,
  ],
})
export class ChequesModule {}
