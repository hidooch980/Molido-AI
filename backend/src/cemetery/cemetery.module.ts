import { Module } from '@nestjs/common';
import { CemeteryService } from './cemetery.service';
import { CemeteryController } from './cemetery.controller';

@Module({
  controllers: [CemeteryController],
  providers: [CemeteryService],
  exports: [CemeteryService],
})
export class CemeteryModule {}
