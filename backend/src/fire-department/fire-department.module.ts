import { Module } from '@nestjs/common';

import { FireDepartmentController } from './fire-department.controller';
import { FireDepartmentService } from './fire-department.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    FireDepartmentController,
  ],
  providers: [
    FireDepartmentService,
  ],
  exports: [
    FireDepartmentService,
  ],
})
export class FireDepartmentModule {}
