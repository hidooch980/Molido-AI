import { Module } from '@nestjs/common';
import { ServiceZonesService } from './service-zones.service';
import { ServiceZonesController } from './service-zones.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ServiceZonesController],
  providers: [ServiceZonesService],
  exports: [ServiceZonesService],
})
export class ServiceZonesModule {}
