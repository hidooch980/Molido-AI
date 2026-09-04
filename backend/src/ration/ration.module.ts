import { Global, Module } from '@nestjs/common';
import { RationService } from './ration.service';
import { RationController } from './ration.controller';
import { ShahkarModule } from '../shahkar/shahkar.module';

/**
 * @Global() — سرویس فروش هنگام تسویه باید بتواند از اعتبار کالابرگ برداشت کند.
 */
@Global()
@Module({
  imports: [ShahkarModule],
  controllers: [RationController],
  providers: [RationService],
  exports: [RationService],
})
export class RationModule {}
