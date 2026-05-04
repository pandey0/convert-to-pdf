-- AlterTable
ALTER TABLE "ConversionJob"
ADD COLUMN "nextRetryAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConversionJob_nextRetryAt_idx" ON "ConversionJob"("nextRetryAt");
