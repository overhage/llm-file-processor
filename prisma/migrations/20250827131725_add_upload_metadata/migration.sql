/*
  Warnings:

  - A unique constraint covering the columns `[blobKey]` on the table `Upload` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."Job" DROP CONSTRAINT "Job_uploadId_fkey";

-- AlterTable
ALTER TABLE "public"."Upload" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "size" INTEGER,
ADD COLUMN     "store" TEXT;

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "public"."Job"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_blobKey_key" ON "public"."Upload"("blobKey");

-- CreateIndex
CREATE INDEX "Upload_userId_idx" ON "public"."Upload"("userId");

-- CreateIndex
CREATE INDEX "Upload_createdAt_idx" ON "public"."Upload"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
