import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppConfig } from '@molido/config';
import { checkDatabaseHealth } from '@molido/database';
import type { ComponentHealth, DetailedHealthResponse, HealthResponse } from '@molido/types';
import { APP_CONFIG } from '../../config/config.module';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const SERVICE_VERSION = '0.1.0';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Liveness. Answers one question — is this process serving? — and answers it
   * without touching a dependency, so a load balancer never restarts a healthy
   * API because the database was briefly slow.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe.' })
  health(): HealthResponse {
    return { status: 'ok', service: 'molido-api' };
  }

  /**
   * Readiness. Probes each dependency and reports honestly, including "AI is
   * not configured" — which is the truthful state of the MVP, not a failure.
   */
  @Public()
  @Get('detailed')
  @ApiOperation({ summary: 'Readiness probe with per-dependency status.' })
  async detailed(): Promise<DetailedHealthResponse> {
    const [database, redis] = await Promise.all([
      checkDatabaseHealth(this.prisma),
      this.redis.health(),
    ]);

    const ai: ComponentHealth = this.config.ai.enabled
      ? { status: 'ok', detail: `provider ${this.config.ai.provider}` }
      : { status: 'disabled', detail: 'no AI provider configured' };

    const components = {
      database: { status: database.status, latencyMs: database.latencyMs, detail: database.detail },
      redis: { status: redis.status, latencyMs: redis.latencyMs, detail: redis.detail },
      ai,
    } satisfies DetailedHealthResponse['components'];

    // The database is the only hard dependency: without it nothing works. Redis
    // being down degrades queueing but leaves the API usable.
    const status: DetailedHealthResponse['status'] =
      database.status === 'down' ? 'down' : redis.status === 'down' ? 'degraded' : 'ok';

    return {
      status,
      service: 'molido-api',
      version: SERVICE_VERSION,
      environment: this.config.env,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      components,
    };
  }
}
