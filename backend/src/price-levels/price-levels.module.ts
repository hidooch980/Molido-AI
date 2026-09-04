import { Module } from '@nestjs/common';
import { PriceLevelsService } from './price-levels.service';
import { PriceLevelsController } from './price-levels.controller';

@Module({
  controllers: [PriceLevelsController],
  providers: [PriceLevelsService],
  exports: [PriceLevelsService],
})
export class PriceLevelsModule {}
