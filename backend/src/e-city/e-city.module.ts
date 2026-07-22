import { Module } from '@nestjs/common';
import { ECityService } from './e-city.service';
import { ECityController } from './e-city.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ECityController],
  providers: [ECityService],
  exports: [ECityService],
})
export class ECityModule {}
