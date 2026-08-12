import { Global, Module } from '@nestjs/common';
import { RationService } from './ration.service';
import { RationController } from './ration.controller';

/**
 * @Global() — سرویس فروش هنگام تسویه باید بتواند از اعتبار کالابرگ برداشت کند.
 */
@Global()
@Module({
  controllers: [RationController],
  providers: [RationService],
  exports: [RationService],
})
export class RationModule {}
