-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blobKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Job" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "rowsTotal" INTEGER,
    "rowsProcessed" INTEGER,
    "outputBlobKey" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "costCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "userId" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MasterRecord" (
    "pairId" TEXT NOT NULL,
    "conceptA" VARCHAR(255) NOT NULL,
    "codeA" VARCHAR(20) NOT NULL,
    "conceptB" VARCHAR(255) NOT NULL,
    "codeB" VARCHAR(20) NOT NULL,
    "systemA" VARCHAR(12) NOT NULL,
    "systemB" VARCHAR(12) NOT NULL,
    "typeA" VARCHAR(20) NOT NULL,
    "typeB" VARCHAR(20) NOT NULL,
    "countsAB" INTEGER NOT NULL,
    "lift" DOUBLE PRECISION,
    "relationshipType" VARCHAR(12) NOT NULL,
    "relationshipCode" INTEGER NOT NULL,
    "rational" VARCHAR(255) NOT NULL,
    "llmDate" TIMESTAMP(3),
    "llmName" VARCHAR(100),
    "llmVersion" VARCHAR(50),
    "humanDate" TIMESTAMP(3),
    "humanReviewer" VARCHAR(254),
    "humanReviewComment" VARCHAR(255),
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterRecord_pkey" PRIMARY KEY ("pairId")
);

-- CreateTable
CREATE TABLE "public"."LlmCache" (
    "id" TEXT NOT NULL,
    "promptKey" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "MasterRecord_codeA_systemA_idx" ON "public"."MasterRecord"("codeA", "systemA");

-- CreateIndex
CREATE INDEX "MasterRecord_codeB_systemB_idx" ON "public"."MasterRecord"("codeB", "systemB");

-- CreateIndex
CREATE UNIQUE INDEX "LlmCache_promptKey_key" ON "public"."LlmCache"("promptKey");

-- AddForeignKey
ALTER TABLE "public"."Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
