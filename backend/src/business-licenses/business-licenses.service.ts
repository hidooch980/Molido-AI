import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BusinessLicensesService extends BaseCrudService {
  protected readonly table = 'BusinessLicense';
  protected readonly notFoundMessage = 'پروانه کسب یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
