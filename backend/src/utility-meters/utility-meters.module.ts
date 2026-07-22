import { Module } from '@nestjs/common';
import { UtilityMetersService } from './utility-meters.service';
import { UtilityMetersController } from './utility-meters.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UtilityMetersController],
  providers: [UtilityMetersService],
  exports: [UtilityMetersService],
})
export class UtilityMetersModule {}
