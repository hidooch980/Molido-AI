import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { LivenessController } from './liveness.controller';

@Module({
  controllers: [HealthController, LivenessController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
