import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CustomersService extends BaseCrudService {
  protected readonly table = 'Customer';
  protected readonly notFoundMessage = 'مشتری یافت نشد';
  protected readonly searchColumns = ['firstName', 'lastName', 'phone', 'email', 'nationalCode'];

  constructor(db: DatabaseService) {
    super(db);
  }
}
