import { Global, Module } from '@nestjs/common';
import { RevenueService } from './revenue.service';
import { RevenueController } from './revenue.controller';

/**
 * @Global() — هر زیرسیستم درآمدی (عوارض، جواز کسب، پارکینگ، آرامستان، ...)
 * باید بتواند بدون import مستقیم وجه دریافت کند.
 */
@Global()
@Module({
  controllers: [RevenueController],
  providers: [RevenueService],
  exports: [RevenueService],
})
export class RevenueModule {}
