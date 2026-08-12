import { Module } from '@nestjs/common';
import { SerialNumbersService } from './serial-numbers.service';
import { SerialNumbersController } from './serial-numbers.controller';

@Module({
  controllers: [SerialNumbersController],
  providers: [SerialNumbersService],
  exports: [SerialNumbersService],
})
export class SerialNumbersModule {}
