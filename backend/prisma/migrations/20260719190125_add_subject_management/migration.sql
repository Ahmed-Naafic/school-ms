-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "educationLevel" "EducationLevel" NOT NULL,
    "status" "SubjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_subjects" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "school_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_educationLevel_key" ON "subjects"("name", "educationLevel");

-- CreateIndex
CREATE INDEX "school_subjects_schoolId_idx" ON "school_subjects"("schoolId");

-- CreateIndex
CREATE INDEX "school_subjects_subjectId_idx" ON "school_subjects"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "school_subjects_schoolId_subjectId_key" ON "school_subjects"("schoolId", "subjectId");

-- AddForeignKey
ALTER TABLE "school_subjects" ADD CONSTRAINT "school_subjects_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_subjects" ADD CONSTRAINT "school_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
