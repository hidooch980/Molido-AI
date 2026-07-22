import { Module } from '@nestjs/common';
import { CemeteryService } from './cemetery.service';
import { CemeteryController } from './cemetery.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CemeteryController],
  providers: [CemeteryService],
  exports: [CemeteryService],
})
export class CemeteryModule {}
