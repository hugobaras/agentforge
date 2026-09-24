-- AlterTable
ALTER TABLE "processed_events" ADD COLUMN "consumerGroup" TEXT NOT NULL DEFAULT 'default';

-- DropIndex
DROP INDEX "processed_events_eventId_key";

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_eventId_consumerGroup_key" ON "processed_events"("eventId", "consumerGroup");
