-- MOLIDO AI — TASK 006: permissions, security events, agent typing.
--
-- Additive by intent. The three dropped columns are superseded, not lost:
--   roles.permissions   → replaced by the permissions / role_permissions tables
--                         and re-applied by the seed on the next run
--   audit_logs.userId   → renamed to actorUserId (table empty)
--   ai_tasks.finishedAt → renamed to completedAt (table empty)
--   system_events.name  → renamed to type (table empty)
--
-- Verified empty before applying: users, sessions, audit_logs, ai_tasks,
-- system_events. No user data is touched by this migration.

-- CreateEnum
CREATE TYPE "AiAgentType" AS ENUM ('RESEARCH', 'ANALYSIS', 'AUTOMATION');
-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'LOGOUT_ALL', 'REGISTER_SUCCESS', 'REGISTER_FAILURE', 'TOKEN_REFRESH', 'TOKEN_REUSE_DETECTED', 'SESSION_REVOKED', 'ACCOUNT_LOCKED', 'AUTHORIZATION_FAILURE', 'RATE_LIMIT_TRIGGERED', 'SUSPICIOUS_ACTIVITY');
-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
-- AlterEnum
ALTER TYPE "AiAgentStatus" ADD VALUE 'MAINTENANCE';
-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";
-- DropIndex
DROP INDEX "audit_logs_userId_idx";
-- DropIndex
DROP INDEX "system_events_name_idx";
-- AlterTable
ALTER TABLE "ai_agents" ADD COLUMN     "configuration" JSONB,
ADD COLUMN     "type" "AiAgentType" NOT NULL DEFAULT 'RESEARCH';
-- AlterTable
ALTER TABLE "ai_tasks" DROP COLUMN "finishedAt",
ADD COLUMN     "completedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "userId",
ADD COLUMN     "actorUserId" UUID;
-- AlterTable
ALTER TABLE "roles" DROP COLUMN "permissions";
-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "deviceId" VARCHAR(128);
-- AlterTable
ALTER TABLE "system_events" DROP COLUMN "name",
ADD COLUMN     "severity" "Severity" NOT NULL DEFAULT 'LOW',
ADD COLUMN     "type" VARCHAR(120) NOT NULL;
-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" UUID,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);
-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'LOW',
    "userId" UUID,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "requestId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");
-- CreateIndex
CREATE INDEX "security_events_type_idx" ON "security_events"("type");
-- CreateIndex
CREATE INDEX "security_events_severity_idx" ON "security_events"("severity");
-- CreateIndex
CREATE INDEX "security_events_userId_idx" ON "security_events"("userId");
-- CreateIndex
CREATE INDEX "security_events_ipAddress_idx" ON "security_events"("ipAddress");
-- CreateIndex
CREATE INDEX "security_events_createdAt_idx" ON "security_events"("createdAt");
-- CreateIndex
CREATE INDEX "security_events_type_createdAt_idx" ON "security_events"("type", "createdAt");
-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");
-- CreateIndex
CREATE INDEX "system_events_severity_idx" ON "system_events"("severity");
-- CreateIndex
CREATE INDEX "system_events_type_idx" ON "system_events"("type");
-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
