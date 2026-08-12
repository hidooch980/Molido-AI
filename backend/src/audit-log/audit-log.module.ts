import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditTrailService } from './audit-trail.service';
import { AuditLogController } from './audit-log.controller';

/**
 * @Global() — AuditTrailService باید از هر ماژولی بدون import قابل تزریق باشد،
 * چون ثبت رویداد یک نگرانی عرضی است نه وابستگی دامنه‌ای.
 */
@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditTrailService],
  exports: [AuditLogService, AuditTrailService],
})
export class AuditLogModule {}
