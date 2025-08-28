/*
  Warnings:

  - Added the required column `source_count` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."MasterRecord" ADD COLUMN     "source_count" INTEGER NOT NULL;
