import { Module } from '@nestjs/common';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AssistantService } from './assistant.service';
import { LlmService } from './llm.service';
import { ReportsModule } from '../reports/reports.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ReportsModule, NotificationsModule],
  controllers: [AiController],
  providers: [AiService, AssistantService, LlmService],
  exports: [AiService, AssistantService],
})
export class AiModule {}
