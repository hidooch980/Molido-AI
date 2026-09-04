import { Module } from '@nestjs/common';

import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';


@Module({
  imports: [
    ],
  controllers: [
    UploadsController,
  ],
  providers: [
    UploadsService,
  ],
  exports: [
    UploadsService,
  ],
})
export class UploadsModule {}
