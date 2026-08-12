import { Module } from '@nestjs/common';

import { FireDepartmentController } from './fire-department.controller';
import { FireDepartmentService } from './fire-department.service';


@Module({
  imports: [
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
