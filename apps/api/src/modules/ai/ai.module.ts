import { Module } from '@nestjs/common';
import { AiQueueService } from './ai-queue.service';
import { AiController } from './ai.controller';
import { AiOrchestrator } from './ai.orchestrator';
import { AiProviderService } from './ai.provider';
import { AiService } from './ai.service';

/**
 * The API validates, authorises and enqueues. Execution lives in
 * `workers/ai-worker`, which runs the same agent implementation from
 * `@molido/ai-core` — so a slow model cannot hold an HTTP request open, and a
 * restart does not lose queued work.
 */
@Module({
  controllers: [AiController],
  providers: [AiService, AiOrchestrator, AiProviderService, AiQueueService],
  exports: [AiService, AiProviderService, AiQueueService],
})
export class AiModule {}
