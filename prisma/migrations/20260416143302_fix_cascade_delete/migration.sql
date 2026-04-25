-- DropForeignKey
ALTER TABLE "JuryMember" DROP CONSTRAINT "JuryMember_sectionId_fkey";

-- DropForeignKey
ALTER TABLE "Score" DROP CONSTRAINT "Score_criterionId_fkey";

-- DropForeignKey
ALTER TABLE "Score" DROP CONSTRAINT "Score_juryMemberId_fkey";

-- DropForeignKey
ALTER TABLE "Score" DROP CONSTRAINT "Score_presenterId_fkey";

-- AddForeignKey
ALTER TABLE "JuryMember" ADD CONSTRAINT "JuryMember_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_juryMemberId_fkey" FOREIGN KEY ("juryMemberId") REFERENCES "JuryMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
