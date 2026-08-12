import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class HelpdeskService extends BaseCrudService {
  protected readonly table = 'HelpTicket';
  protected readonly notFoundMessage = 'هلپ‌دسک یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
