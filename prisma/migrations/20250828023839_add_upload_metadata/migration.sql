-- AlterTable
ALTER TABLE "public"."Upload" ADD COLUMN     "contentType" VARCHAR(100),
ADD COLUMN     "size" INTEGER,
ADD COLUMN     "store" VARCHAR(20);
