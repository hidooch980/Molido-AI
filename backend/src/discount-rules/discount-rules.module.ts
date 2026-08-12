import { Module } from '@nestjs/common';
import { DiscountRulesService } from './discount-rules.service';
import { DiscountRulesController } from './discount-rules.controller';

@Module({
  controllers: [DiscountRulesController],
  providers: [DiscountRulesService],
  exports: [DiscountRulesService],
})
export class DiscountRulesModule {}
