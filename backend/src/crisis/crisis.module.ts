import { Module } from '@nestjs/common';
import { CrisisService } from './crisis.service';
import { CrisisController } from './crisis.controller';

@Module({
  controllers: [CrisisController],
  providers: [CrisisService],
  exports: [CrisisService],
})
export class CrisisModule {}
