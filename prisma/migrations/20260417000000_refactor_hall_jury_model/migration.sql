-- Migration: refactor_hall_jury_model
-- Move JuryMember from hall-level to conference-level
-- Add JurySectionAssignment many-to-many table

-- Step 1: Add conferenceId to JuryMember (with temp default to satisfy NOT NULL)
ALTER TABLE "JuryMember" ADD COLUMN "conferenceId" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Populate conferenceId from Hall
UPDATE "JuryMember" jm
SET "conferenceId" = h."conferenceId"
FROM "Hall" h
WHERE h.id = jm."hallId";

-- Step 3: Drop the old FK constraint and hallId column
ALTER TABLE "JuryMember" DROP CONSTRAINT "JuryMember_hallId_fkey";
ALTER TABLE "JuryMember" ALTER COLUMN "conferenceId" DROP DEFAULT;
ALTER TABLE "JuryMember" DROP COLUMN "hallId";

-- Step 4: Add new FK from JuryMember to Conference
ALTER TABLE "JuryMember" ADD CONSTRAINT "JuryMember_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Create JurySectionAssignment table
CREATE TABLE "JurySectionAssignment" (
    "id" SERIAL NOT NULL,
    "juryMemberId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JurySectionAssignment_pkey" PRIMARY KEY ("id")
);

-- Step 6: Add FKs for JurySectionAssignment
ALTER TABLE "JurySectionAssignment" ADD CONSTRAINT "JurySectionAssignment_juryMemberId_fkey"
  FOREIGN KEY ("juryMemberId") REFERENCES "JuryMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JurySectionAssignment" ADD CONSTRAINT "JurySectionAssignment_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Add unique index
CREATE UNIQUE INDEX "JurySectionAssignment_juryMemberId_sectionId_key"
  ON "JurySectionAssignment"("juryMemberId", "sectionId");
