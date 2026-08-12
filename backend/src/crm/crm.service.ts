import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CrmService extends BaseCrudService {
  protected readonly table = 'LoyaltyAccount';
  protected readonly notFoundMessage = 'CRM یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
