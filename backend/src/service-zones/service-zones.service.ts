import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ServiceZonesService extends BaseCrudService {
  protected readonly table = 'ServiceZone';
  protected readonly notFoundMessage = 'فضای سبز و پسماند یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
