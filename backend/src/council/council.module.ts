import { Module } from '@nestjs/common';
import { CouncilService } from './council.service';
import { CouncilController } from './council.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CouncilController],
  providers: [CouncilService],
  exports: [CouncilService],
})
export class CouncilModule {}
