import { Module } from '@nestjs/common';

import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
