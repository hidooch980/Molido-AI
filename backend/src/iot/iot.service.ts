import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class IotService extends BaseCrudService {
  protected readonly table = 'IotSensor';
  protected readonly notFoundMessage = 'سنسورهای IoT یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
