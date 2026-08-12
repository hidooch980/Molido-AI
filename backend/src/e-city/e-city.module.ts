import { Module } from '@nestjs/common';
import { ECityService } from './e-city.service';
import { ECityController } from './e-city.controller';

@Module({
  controllers: [ECityController],
  providers: [ECityService],
  exports: [ECityService],
})
export class ECityModule {}
