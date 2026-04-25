-- AddColumn: Conference.useSlider
ALTER TABLE "Conference" ADD COLUMN IF NOT EXISTS "useSlider" BOOLEAN NOT NULL DEFAULT true;

-- AddColumn: Criterion.order
ALTER TABLE "Criterion" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;

-- AddColumn: Presenter.position
ALTER TABLE "Presenter" ADD COLUMN IF NOT EXISTS "position" VARCHAR(256);

-- Decouple Section from Hall
-- Step 1: Add conferenceId as nullable (will populate before setting NOT NULL)
ALTER TABLE "Section" ADD COLUMN IF NOT EXISTS "conferenceId" INTEGER;

-- Step 2: Backfill conferenceId from halls
UPDATE "Section" s
SET "conferenceId" = h."conferenceId"
FROM "Hall" h
WHERE h.id = s."hallId";

-- Step 3: Set NOT NULL
ALTER TABLE "Section" ALTER COLUMN "conferenceId" SET NOT NULL;

-- Step 4: Make hallId nullable (drop NOT NULL)
ALTER TABLE "Section" ALTER COLUMN "hallId" DROP NOT NULL;

-- Step 5: Add foreign key for new conferenceId column
ALTER TABLE "Section" ADD CONSTRAINT "Section_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Update hallId FK to use SET NULL on delete instead of CASCADE
ALTER TABLE "Section" DROP CONSTRAINT "Section_hallId_fkey";
ALTER TABLE "Section" ADD CONSTRAINT "Section_hallId_fkey"
  FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
