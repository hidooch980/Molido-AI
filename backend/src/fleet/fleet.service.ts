import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FleetService extends BaseCrudService {
  protected readonly table = 'FleetVehicle';
  protected readonly notFoundMessage = 'ناوگان یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
