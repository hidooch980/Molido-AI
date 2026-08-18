import { Inject, Injectable, Logger } from '@nestjs/common';
import { createAIProvider, type AIProvider, type AIProviderHealth } from '@molido/ai-core';
import type { AppConfig } from '@molido/config';
import { APP_CONFIG } from '../../config/config.module';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/**
 * Resolves the configured provider once, at startup.
 *
 * The rest of the API depends on the `AIProvider` interface and is given
 * whatever the environment selected — including `NullProvider` when nothing is
 * configured, which is the MVP's normal state.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  readonly provider: AIProvider;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.provider = createAIProvider({
      provider: config.ai.provider,
      model: config.ai.model,
      apiKey: config.ai.apiKey,
      baseUrl: config.ai.baseUrl,
    });

    // Logs the provider name and model. The key is never touched here.
    this.logger.log(
      this.provider.name === 'null'
        ? 'AI provider not configured — AI features will return AI_PROVIDER_NOT_CONFIGURED'
        : `AI provider: ${this.provider.name} (model: ${this.provider.defaultModel})`,
    );
  }

  async health(): Promise<AIProviderHealth> {
    return this.provider.healthCheck();
  }
}
