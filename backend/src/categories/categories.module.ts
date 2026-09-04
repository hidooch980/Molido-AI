import { Module } from '@nestjs/common';

import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';


@Module({
  imports: [
    ],
  controllers: [
    CategoriesController,
  ],
  providers: [
    CategoriesService,
  ],
  exports: [
    CategoriesService,
  ],
})
export class CategoriesModule {}
