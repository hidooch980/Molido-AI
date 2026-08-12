import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ConstructionProjectsService extends BaseCrudService {
  protected readonly table = 'ConstructionProject';
  protected readonly notFoundMessage = 'پروژه عمرانی یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
