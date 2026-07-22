import { Module } from '@nestjs/common';

import { PosTerminalsController } from './pos-terminals.controller';
import { PosTerminalsService } from './pos-terminals.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    PosTerminalsController,
  ],
  providers: [
    PosTerminalsService,
  ],
  exports: [
    PosTerminalsService,
  ],
})
export class PosTerminalsModule {}
