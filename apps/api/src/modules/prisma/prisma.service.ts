import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type AppConfig, describeConnection } from '@molido/config';
import { buildPrismaOptions, PrismaClient } from '@molido/database';
import { APP_CONFIG } from '../../config/config.module';

/**
 * The application's single PrismaClient.
 *
 * Extending PrismaClient (rather than wrapping it) keeps the full typed query
 * surface available to services while giving Nest ownership of the connection
 * lifecycle.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  private readonly databaseUrl: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super(buildPrismaOptions({ databaseUrl: config.database.url }));
    this.databaseUrl = config.database.url;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // Logs the host and database only — never the credentials.
    this.logger.log(`Database connected: ${describeConnection(this.databaseUrl)}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
