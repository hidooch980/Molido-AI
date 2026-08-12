import { Module } from '@nestjs/common';
import { ServiceZonesService } from './service-zones.service';
import { ServiceZonesController } from './service-zones.controller';

@Module({
  controllers: [ServiceZonesController],
  providers: [ServiceZonesService],
  exports: [ServiceZonesService],
})
export class ServiceZonesModule {}
