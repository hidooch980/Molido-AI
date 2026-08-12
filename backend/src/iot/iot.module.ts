import { Module } from '@nestjs/common';
import { IotService } from './iot.service';
import { IotController } from './iot.controller';

@Module({
  controllers: [IotController],
  providers: [IotService],
  exports: [IotService],
})
export class IotModule {}
