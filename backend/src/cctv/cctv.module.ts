import { Module } from '@nestjs/common';
import { CctvService } from './cctv.service';
import { CctvController } from './cctv.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CctvController],
  providers: [CctvService],
  exports: [CctvService],
})
export class CctvModule {}
