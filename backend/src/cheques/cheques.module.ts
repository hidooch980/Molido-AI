import { Module } from '@nestjs/common';

import { ChequesController } from './cheques.controller';
import { ChequesService } from './cheques.service';


@Module({
  imports: [
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
