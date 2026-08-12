import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SerialNumbersService extends BaseCrudService {
  protected readonly table = 'SerialNumber';
  protected readonly notFoundMessage = 'سریال و بچ یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
