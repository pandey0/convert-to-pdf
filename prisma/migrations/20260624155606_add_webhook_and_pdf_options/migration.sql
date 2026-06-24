-- AlterTable
ALTER TABLE "ConversionJob" ADD COLUMN     "pageNumbers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "watermarkText" TEXT,
ADD COLUMN     "webhookSentAt" TIMESTAMP(3),
ADD COLUMN     "webhookUrl" TEXT;
