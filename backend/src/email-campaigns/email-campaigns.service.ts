import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EmailCampaignsService extends BaseCrudService {
  protected readonly table = 'EmailCampaign';
  protected readonly notFoundMessage = 'کمپین ایمیل یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
