import { Module } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { BudgetCommitmentService } from './commitment.service';
import { BudgetController } from './budget.controller';

@Module({
  controllers: [BudgetController],
  providers: [BudgetService, BudgetCommitmentService],
  exports: [BudgetService, BudgetCommitmentService],
})
export class BudgetModule {}
