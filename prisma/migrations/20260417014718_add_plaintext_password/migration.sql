-- AlterTable
ALTER TABLE "Hall" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "JuryMember" ADD COLUMN     "plaintextPassword" TEXT;
