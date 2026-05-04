-- CreateTable
CREATE TABLE "ConversionJob" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "compress" BOOLEAN NOT NULL DEFAULT false,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalSize" INTEGER NOT NULL DEFAULT 0,
    "outputKey" TEXT,
    "outputSize" INTEGER,
    "errorMessage" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionJobFile" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionJobFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversionJob_razorpayOrderId_key" ON "ConversionJob"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "ConversionJob_ipHash_idx" ON "ConversionJob"("ipHash");

-- CreateIndex
CREATE INDEX "ConversionJob_status_idx" ON "ConversionJob"("status");

-- CreateIndex
CREATE INDEX "ConversionJob_paymentStatus_idx" ON "ConversionJob"("paymentStatus");

-- CreateIndex
CREATE INDEX "ConversionJobFile_jobId_idx" ON "ConversionJobFile"("jobId");

-- CreateIndex
CREATE INDEX "ConversionJobFile_storageKey_idx" ON "ConversionJobFile"("storageKey");

-- AddForeignKey
ALTER TABLE "ConversionJobFile" ADD CONSTRAINT "ConversionJobFile_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ConversionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
