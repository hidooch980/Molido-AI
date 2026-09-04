import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WebhooksService extends BaseCrudService {
  protected readonly table = 'Webhook';
  protected readonly notFoundMessage = 'وب‌هوک‌ها یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
