/*
  Warnings:

  - You are about to drop the column `codeA` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `codeB` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `conceptA` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `conceptB` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `countsAB` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `humanDate` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `humanReviewComment` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `humanReviewer` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `llmDate` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `llmName` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `llmVersion` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `sourceCount` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `systemA` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `systemB` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `typeA` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to drop the column `typeB` on the `MasterRecord` table. All the data in the column will be lost.
  - You are about to alter the column `lift` on the `MasterRecord` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(19,4)`.
  - Added the required column `a_before_b` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `a_only_h` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ab_h` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `b_before_a` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `b_only_h` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code_a` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code_b` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `concept_a` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `concept_b` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `confidence_a_to_b` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `confidence_b_to_a` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cooc_event_count` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cooc_obs` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dir_lower_95` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dir_prop_a_before_b` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dir_upper_95` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `directionality_ratio` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expected_obs` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lift_lower_95` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lift_upper_95` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nA` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nB` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `neither_h` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `odds_ratio` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `or_lower_95` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `or_upper_95` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `system_a` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `system_b` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_persons` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type_a` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type_b` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `z_score` to the `MasterRecord` table without a default value. This is not possible if the table is not empty.
  - Made the column `lift` on table `MasterRecord` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "public"."MasterRecord_codeA_systemA_idx";

-- DropIndex
DROP INDEX "public"."MasterRecord_codeB_systemB_idx";

-- AlterTable
ALTER TABLE "public"."MasterRecord" DROP COLUMN "codeA",
DROP COLUMN "codeB",
DROP COLUMN "conceptA",
DROP COLUMN "conceptB",
DROP COLUMN "countsAB",
DROP COLUMN "humanDate",
DROP COLUMN "humanReviewComment",
DROP COLUMN "humanReviewer",
DROP COLUMN "llmDate",
DROP COLUMN "llmName",
DROP COLUMN "llmVersion",
DROP COLUMN "sourceCount",
DROP COLUMN "systemA",
DROP COLUMN "systemB",
DROP COLUMN "typeA",
DROP COLUMN "typeB",
ADD COLUMN     "a_before_b" INTEGER NOT NULL,
ADD COLUMN     "a_only_h" DECIMAL(19,2) NOT NULL,
ADD COLUMN     "ab_h" DECIMAL(19,2) NOT NULL,
ADD COLUMN     "b_before_a" INTEGER NOT NULL,
ADD COLUMN     "b_only_h" DECIMAL(19,2) NOT NULL,
ADD COLUMN     "code_a" VARCHAR(20) NOT NULL,
ADD COLUMN     "code_b" VARCHAR(20) NOT NULL,
ADD COLUMN     "concept_a" VARCHAR(255) NOT NULL,
ADD COLUMN     "concept_b" VARCHAR(255) NOT NULL,
ADD COLUMN     "confidence_a_to_b" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "confidence_b_to_a" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "cooc_event_count" INTEGER NOT NULL,
ADD COLUMN     "cooc_obs" INTEGER NOT NULL,
ADD COLUMN     "dir_lower_95" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "dir_prop_a_before_b" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "dir_upper_95" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "directionality_ratio" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "expected_obs" DECIMAL(19,2) NOT NULL,
ADD COLUMN     "human_comment" VARCHAR(255),
ADD COLUMN     "human_date" TIMESTAMP(3),
ADD COLUMN     "human_reviewer" VARCHAR(254),
ADD COLUMN     "lift_lower_95" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "lift_upper_95" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "llm_date" TIMESTAMP(3),
ADD COLUMN     "llm_name" VARCHAR(100),
ADD COLUMN     "llm_version" VARCHAR(50),
ADD COLUMN     "nA" INTEGER NOT NULL,
ADD COLUMN     "nB" INTEGER NOT NULL,
ADD COLUMN     "neither_h" DECIMAL(19,2) NOT NULL,
ADD COLUMN     "odds_ratio" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "or_lower_95" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "or_upper_95" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "system_a" VARCHAR(12) NOT NULL,
ADD COLUMN     "system_b" VARCHAR(12) NOT NULL,
ADD COLUMN     "total_persons" INTEGER NOT NULL,
ADD COLUMN     "type_a" VARCHAR(20) NOT NULL,
ADD COLUMN     "type_b" VARCHAR(20) NOT NULL,
ADD COLUMN     "z_score" DECIMAL(19,4) NOT NULL,
ALTER COLUMN "lift" SET NOT NULL,
ALTER COLUMN "lift" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" SET DATA TYPE VARCHAR(12);

-- CreateIndex
CREATE INDEX "MasterRecord_code_a_system_a_idx" ON "public"."MasterRecord"("code_a", "system_a");

-- CreateIndex
CREATE INDEX "MasterRecord_code_b_system_b_idx" ON "public"."MasterRecord"("code_b", "system_b");
