import { Module } from '@nestjs/common';
import { MunicipalPropertiesService } from './municipal-properties.service';
import { MunicipalPropertiesController } from './municipal-properties.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MunicipalPropertiesController],
  providers: [MunicipalPropertiesService],
  exports: [MunicipalPropertiesService],
})
export class MunicipalPropertiesModule {}
