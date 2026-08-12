import { Module } from '@nestjs/common';
import { PropertyAuditService } from './property-audit.service';
import { PropertyAuditController } from './property-audit.controller';

@Module({
  controllers: [PropertyAuditController],
  providers: [PropertyAuditService],
  exports: [PropertyAuditService],
})
export class PropertyAuditModule {}
