import { Global, Module } from '@nestjs/common';

import { N8nService } from './n8n.service';
import { N8nController } from './n8n.controller';

/**
 * @Global() — N8nService در تمام ماژول‌ها بدون import قابل تزریق است
 */
@Global()
@Module({
  controllers: [N8nController],
  providers: [N8nService],
  exports: [N8nService],
})
export class N8nModule {}
