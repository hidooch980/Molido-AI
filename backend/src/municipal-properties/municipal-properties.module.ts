import { Module } from '@nestjs/common';
import { MunicipalPropertiesService } from './municipal-properties.service';
import { MunicipalPropertiesController } from './municipal-properties.controller';

@Module({
  controllers: [MunicipalPropertiesController],
  providers: [MunicipalPropertiesService],
  exports: [MunicipalPropertiesService],
})
export class MunicipalPropertiesModule {}
