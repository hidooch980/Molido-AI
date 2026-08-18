import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SecurityEventService } from './security-event.service';

/**
 * Global: audit and security recording must be available to every module
 * without ceremony, so there is never an excuse for an unlogged privileged
 * action.
 */
@Global()
@Module({
  providers: [AuditService, SecurityEventService],
  exports: [AuditService, SecurityEventService],
})
export class OversightModule {}
