-- Phase 6: offline sync (FR-OFF-01-14, DR-05, NFR-REL-05). sync_operations
-- holds durable per-operation receipts for the offline upload endpoint's
-- retry-safe replay protocol (see docs/adr/0008-phase-6-offline-sync.md).
-- Deliberately NOT covered by the physical-deletion-rejection triggers
-- (see migration.sql from 20260820170711_init) -- like sessions/account/
-- verification from Phase 2, this is sync infrastructure, not a business
-- record; a documented, safe retention/cleanup mechanism (see
-- src/server/sync/retention.ts) is the only thing permitted to delete rows
-- here, never a blind TTL and never this project's ordinary archive
-- semantics.

-- CreateEnum
CREATE TYPE "sync_operation_action" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "sync_operation_status" AS ENUM ('RECEIVED', 'APPLIED', 'CONFLICT', 'REJECTED');

-- CreateTable
CREATE TABLE "sync_operations" (
    "operation_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "client_uuid" UUID NOT NULL,
    "action" "sync_operation_action" NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "status" "sync_operation_status" NOT NULL,
    "result_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("operation_id")
);

-- CreateIndex
CREATE INDEX "sync_operations_actor_user_id_idx" ON "sync_operations"("actor_user_id");

-- CreateIndex
CREATE INDEX "sync_operations_entity_type_client_uuid_idx" ON "sync_operations"("entity_type", "client_uuid");

-- CreateIndex
CREATE INDEX "sync_operations_created_at_idx" ON "sync_operations"("created_at");

-- AddForeignKey
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data backfill (CLAUDE.md Phase 6 mandatory decision #4): every row
-- created before this migration was entered directly online (no offline
-- queue existed yet), so synced_at is set equal to captured_at for any
-- such row that still has it NULL. From this migration forward, online
-- creates set both to the same server-generated timestamp explicitly in
-- application code (see src/server/mutations/*.ts) and offline uploads
-- preserve the device's own captured_at while setting synced_at only at
-- server acceptance -- this one-time backfill never runs again.
-- audit_log is deliberately excluded here: its append-only trigger
-- (CLAUDE.md Sec17/DR-04) rejects UPDATE unconditionally, by design, even
-- for this kind of backfill. audit_log.synced_at stays NULL for every
-- pre-Phase-6 row -- accurate, since none of them ever went through an
-- offline queue -- and no code path may ever attempt to set it after the
-- row is written.
UPDATE "daily_expenses" SET "synced_at" = "captured_at" WHERE "synced_at" IS NULL;
UPDATE "monthly_expenses" SET "synced_at" = "captured_at" WHERE "synced_at" IS NULL;
UPDATE "party_income" SET "synced_at" = "captured_at" WHERE "synced_at" IS NULL;
UPDATE "counter_income" SET "synced_at" = "captured_at" WHERE "synced_at" IS NULL;
