import { Module } from '@nestjs/common';
import { TendersService } from './tenders.service';
import { TendersController } from './tenders.controller';

@Module({
  controllers: [TendersController],
  providers: [TendersService],
  exports: [TendersService],
})
export class TendersModule {}
