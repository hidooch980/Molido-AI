import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiOrchestrator } from './ai.orchestrator';
import { AiProviderService } from './ai.provider';
import { AiService } from './ai.service';
import { ResearchAgent } from './agents/research.agent';

/**
 * Agents are registered here and nowhere else. Adding one means adding a
 * provider to this list and a row to the agent registry — both visible,
 * reviewable acts.
 */
@Module({
  controllers: [AiController],
  providers: [AiService, AiOrchestrator, AiProviderService, ResearchAgent],
  exports: [AiService, AiProviderService],
})
export class AiModule {}
