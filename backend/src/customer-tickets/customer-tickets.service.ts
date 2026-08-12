import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CustomerTicketsService extends BaseCrudService {
  protected readonly table = 'CustomerTicket';
  protected readonly notFoundMessage = 'تیکت مشتری یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
