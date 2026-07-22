import { Module } from '@nestjs/common';
import { PriceLevelsService } from './price-levels.service';
import { PriceLevelsController } from './price-levels.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PriceLevelsController],
  providers: [PriceLevelsService],
  exports: [PriceLevelsService],
})
export class PriceLevelsModule {}
