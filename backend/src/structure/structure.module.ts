import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { StructureController } from './structure.controller';
import { StructureService } from './structure.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StructureController],
  providers: [StructureService],
  exports: [StructureService],
})
export class StructureModule {}
