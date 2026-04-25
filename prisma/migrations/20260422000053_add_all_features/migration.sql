/*
  Warnings:

  - Added the required column `conferenceId` to the `Section` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Section" DROP CONSTRAINT "Section_hallId_fkey";

-- AlterTable
ALTER TABLE "Conference" ADD COLUMN     "useSlider" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Criterion" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Presenter" ADD COLUMN     "position" VARCHAR(256);

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "conferenceId" INTEGER NOT NULL,
ALTER COLUMN "hallId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
