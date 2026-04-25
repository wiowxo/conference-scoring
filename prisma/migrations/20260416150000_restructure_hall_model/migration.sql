-- DropForeignKey
ALTER TABLE "JuryMember" DROP CONSTRAINT "JuryMember_sectionId_fkey";

-- DropForeignKey
ALTER TABLE "Section" DROP CONSTRAINT "Section_conferenceId_fkey";

-- DropForeignKey
ALTER TABLE "VotingStatus" DROP CONSTRAINT "VotingStatus_sectionId_fkey";

-- DropIndex
DROP INDEX "VotingStatus_sectionId_key";

-- AlterTable
ALTER TABLE "JuryMember" DROP COLUMN "sectionId",
ADD COLUMN     "hallId" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Section" DROP COLUMN "conferenceId",
DROP COLUMN "hall",
ADD COLUMN     "hallId" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VotingStatus" DROP COLUMN "sectionId",
ADD COLUMN     "hallId" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Hall" (
    "id" SERIAL NOT NULL,
    "conferenceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VotingStatus_hallId_key" ON "VotingStatus"("hallId");

-- AddForeignKey
ALTER TABLE "Hall" ADD CONSTRAINT "Hall_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuryMember" ADD CONSTRAINT "JuryMember_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingStatus" ADD CONSTRAINT "VotingStatus_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RemoveDefaults (now that FKs are set up, drop the temporary defaults)
ALTER TABLE "JuryMember" ALTER COLUMN "hallId" DROP DEFAULT;
ALTER TABLE "Section" ALTER COLUMN "hallId" DROP DEFAULT;
ALTER TABLE "VotingStatus" ALTER COLUMN "hallId" DROP DEFAULT;
