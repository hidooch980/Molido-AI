import { Global, Module } from '@nestjs/common';
import { SystemStateService } from './system-state.service';

/**
 * Global: the operating mode is consulted by the orchestrator and reported by
 * the Founder endpoints, and neither should have to re-import it.
 */
@Global()
@Module({
  providers: [SystemStateService],
  exports: [SystemStateService],
})
export class SystemModule {}
