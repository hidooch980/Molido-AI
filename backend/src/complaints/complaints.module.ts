import { Module } from '@nestjs/common';

import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    ComplaintsController,
  ],
  providers: [
    ComplaintsService,
  ],
  exports: [
    ComplaintsService,
  ],
})
export class ComplaintsModule {}
