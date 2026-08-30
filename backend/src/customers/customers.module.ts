import { ShahkarModule } from '../shahkar/shahkar.module';
import { Module } from '@nestjs/common';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';


@Module({
  imports: [
    ShahkarModule,
    ],
  controllers: [
    CustomersController,
  ],
  providers: [
    CustomersService,
  ],
  exports: [
    CustomersService,
  ],
})
export class CustomersModule {}
