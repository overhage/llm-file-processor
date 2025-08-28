/*
  Warnings:

  - You are about to drop the column `oauth_token` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `oauth_token_secret` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `contentType` on the `Upload` table. All the data in the column will be lost.
  - You are about to drop the column `size` on the `Upload` table. All the data in the column will be lost.
  - You are about to drop the column `store` on the `Upload` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Job" DROP CONSTRAINT "Job_uploadId_fkey";

-- DropIndex
DROP INDEX "public"."Job_status_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Upload_blobKey_key";

-- DropIndex
DROP INDEX "public"."Upload_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Upload_userId_idx";

-- AlterTable
ALTER TABLE "public"."Account" DROP COLUMN "oauth_token",
DROP COLUMN "oauth_token_secret";

-- AlterTable
ALTER TABLE "public"."Upload" DROP COLUMN "contentType",
DROP COLUMN "size",
DROP COLUMN "store";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "emailVerified",
DROP COLUMN "image",
ALTER COLUMN "role" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
