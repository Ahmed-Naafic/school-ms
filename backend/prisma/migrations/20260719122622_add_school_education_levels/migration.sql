-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('PRIMARY', 'SECONDARY');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "educationLevels" "EducationLevel"[] DEFAULT ARRAY['PRIMARY']::"EducationLevel"[];
