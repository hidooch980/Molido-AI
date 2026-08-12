import { Module } from '@nestjs/common';
import { UtilityMetersService } from './utility-meters.service';
import { UtilityMetersController } from './utility-meters.controller';

@Module({
  controllers: [UtilityMetersController],
  providers: [UtilityMetersService],
  exports: [UtilityMetersService],
})
export class UtilityMetersModule {}
