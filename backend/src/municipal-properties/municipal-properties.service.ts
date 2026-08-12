import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MunicipalPropertiesService extends BaseCrudService {
  protected readonly table = 'MunicipalProperty';
  protected readonly notFoundMessage = 'املاک شهرداری یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
