import { Module } from '@nestjs/common';
import { PropertyAuditService } from './property-audit.service';
import { PropertyAuditController } from './property-audit.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PropertyAuditController],
  providers: [PropertyAuditService],
  exports: [PropertyAuditService],
})
export class PropertyAuditModule {}
