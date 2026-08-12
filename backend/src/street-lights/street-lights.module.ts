import { Module } from '@nestjs/common';
import { StreetLightsService } from './street-lights.service';
import { StreetLightsController } from './street-lights.controller';

@Module({
  controllers: [StreetLightsController],
  providers: [StreetLightsService],
  exports: [StreetLightsService],
})
export class StreetLightsModule {}
