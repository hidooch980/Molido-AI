import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FounderController } from './founder.controller';
import { FounderService } from './founder.service';

@Module({
  imports: [AiModule],
  controllers: [FounderController],
  providers: [FounderService],
})
export class FounderModule {}
