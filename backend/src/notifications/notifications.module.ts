import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';


@Module({
  imports: [
    ],
  controllers: [
    NotificationsController,
    RemindersController,
  ],
  providers: [
    NotificationsService,
    RemindersService,
  ],
  exports: [
    NotificationsService,
    RemindersService,
  ],
})
export class NotificationsModule {}
