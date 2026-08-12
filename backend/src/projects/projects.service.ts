import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProjectsService extends BaseCrudService {
  protected readonly table = 'Project';
  protected readonly notFoundMessage = 'مدیریت پروژه یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }
}
