import { Module } from '@nestjs/common';

import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';


@Module({
  imports: [
    ],
  controllers: [
    ExpensesController,
  ],
  providers: [
    ExpensesService,
  ],
  exports: [
    ExpensesService,
  ],
})
export class ExpensesModule {}
