-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ConferenceStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- CreateTable
CREATE TABLE "Conference" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "ConferenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
    "useSlider" BOOLEAN NOT NULL DEFAULT true,
    "useDefaultRange" BOOLEAN NOT NULL DEFAULT false,
    "qualityZonesTemplate" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hall" (
    "id" SERIAL NOT NULL,
    "conferenceId" INTEGER NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "conferenceId" INTEGER NOT NULL,
    "hallId" INTEGER,
    "name" VARCHAR(256) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presenter" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "supervisor" TEXT,
    "position" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" SERIAL NOT NULL,
    "conferenceId" INTEGER NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "useQualityZones" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityZone" (
    "id" SERIAL NOT NULL,
    "criterionId" INTEGER NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL,
    "maxValue" DOUBLE PRECISION NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JuryMember" (
    "id" SERIAL NOT NULL,
    "conferenceId" INTEGER NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "plaintextPassword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JuryMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurySectionAssignment" (
    "id" SERIAL NOT NULL,
    "juryMemberId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurySectionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" SERIAL NOT NULL,
    "juryMemberId" INTEGER NOT NULL,
    "presenterId" INTEGER NOT NULL,
    "criterionId" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "previousValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organizer" (
    "id" SERIAL NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organizer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingStatus" (
    "id" SERIAL NOT NULL,
    "hallId" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VotingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JuryMember_login_key" ON "JuryMember"("login");

-- CreateIndex
CREATE UNIQUE INDEX "JurySectionAssignment_juryMemberId_sectionId_key" ON "JurySectionAssignment"("juryMemberId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_juryMemberId_presenterId_criterionId_key" ON "Score"("juryMemberId", "presenterId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "Organizer_login_key" ON "Organizer"("login");

-- CreateIndex
CREATE UNIQUE INDEX "VotingStatus_hallId_key" ON "VotingStatus"("hallId");

-- AddForeignKey
ALTER TABLE "Hall" ADD CONSTRAINT "Hall_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presenter" ADD CONSTRAINT "Presenter_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityZone" ADD CONSTRAINT "QualityZone_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuryMember" ADD CONSTRAINT "JuryMember_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurySectionAssignment" ADD CONSTRAINT "JurySectionAssignment_juryMemberId_fkey" FOREIGN KEY ("juryMemberId") REFERENCES "JuryMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurySectionAssignment" ADD CONSTRAINT "JurySectionAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_juryMemberId_fkey" FOREIGN KEY ("juryMemberId") REFERENCES "JuryMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingStatus" ADD CONSTRAINT "VotingStatus_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

