import { Module } from '@nestjs/common';
import { ConstructionProjectsService } from './construction-projects.service';
import { ConstructionProjectsController } from './construction-projects.controller';

@Module({
  controllers: [ConstructionProjectsController],
  providers: [ConstructionProjectsService],
  exports: [ConstructionProjectsService],
})
export class ConstructionProjectsModule {}
