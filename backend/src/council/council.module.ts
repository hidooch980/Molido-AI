import { Module } from '@nestjs/common';
import { CouncilService } from './council.service';
import { CouncilController } from './council.controller';

@Module({
  controllers: [CouncilController],
  providers: [CouncilService],
  exports: [CouncilService],
})
export class CouncilModule {}
