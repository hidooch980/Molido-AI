import { Module } from '@nestjs/common';
import { StreetLightsService } from './street-lights.service';
import { StreetLightsController } from './street-lights.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StreetLightsController],
  providers: [StreetLightsService],
  exports: [StreetLightsService],
})
export class StreetLightsModule {}
