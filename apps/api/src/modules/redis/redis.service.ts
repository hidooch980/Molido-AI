import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type AppConfig, describeConnection } from '@molido/config';
import Redis from 'ioredis';
import { APP_CONFIG } from '../../config/config.module';

export interface RedisHealth {
  status: 'ok' | 'down';
  latencyMs: number;
  detail?: string;
}

/**
 * Redis connection, used for the job queue in a later phase and already
 * reported on by the health endpoint.
 *
 * `lazyConnect` keeps a Redis outage from blocking API startup: the platform
 * comes up degraded and says so, rather than refusing to boot.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    });

    // Without a listener, a connection error is an unhandled 'error' event,
    // which takes the process down.
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.log(`Redis connected: ${describeConnection(this.config.redis.url)}`);
    } catch (error) {
      this.logger.warn(
        `Redis unavailable at startup; continuing in degraded mode: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }

  async health(timeoutMs = 2000): Promise<RedisHealth> {
    const startedAt = Date.now();
    try {
      const pong = await Promise.race([
        this.client.ping(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('probe timed out')), timeoutMs).unref(),
        ),
      ]);
      return pong === 'PONG'
        ? { status: 'ok', latencyMs: Date.now() - startedAt }
        : { status: 'down', latencyMs: Date.now() - startedAt, detail: 'unexpected ping reply' };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        // Never surfaces the URL, which carries credentials.
        detail: error instanceof Error && error.message === 'probe timed out'
          ? 'probe timed out'
          : 'connection failed',
      };
    }
  }
}
