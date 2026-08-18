-- MOLIDO AI — global operating mode (NORMAL / PAUSED).
--
-- Purely additive: one new enum and one new table. No existing column or row
-- is touched.
--
-- The mode lives in the database rather than in process memory so that a
-- Founder's decision to halt AI work survives a restart and is observed
-- identically by every API instance.

-- CreateEnum
CREATE TYPE "SystemMode" AS ENUM ('NORMAL', 'PAUSED');

-- CreateTable
CREATE TABLE "system_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" "SystemMode" NOT NULL DEFAULT 'NORMAL',
    "reason" VARCHAR(500),
    "changedBy" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_state_pkey" PRIMARY KEY ("id")
);


-- Enforce the single row at the database level. Application code assumes
-- exactly one row exists; a constraint makes that assumption true rather than
-- merely intended.
ALTER TABLE "system_state" ADD CONSTRAINT "system_state_single_row" CHECK ("id" = 1);

-- Seed the row so the system has a defined mode from the first request.
INSERT INTO "system_state" ("id", "mode", "updatedAt") VALUES (1, 'NORMAL', CURRENT_TIMESTAMP);
