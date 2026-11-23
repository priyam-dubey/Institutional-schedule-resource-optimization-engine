-- Academic model: additive, non-destructive migration.
--
-- Adds Institution / AcademicYear / Semester / Program / Subject / Section / FacultyProfile /
-- requirements / generations / entries / conflicts. Nothing is dropped or rewritten:
--   * legacy tables keep every row and column;
--   * departments gain institutionId (backfilled to a default institution, then NOT NULL);
--   * branches gain programId and courses gain subjectId (nullable, backfilled below);
--   * rooms and ingestion_jobs gain columns with safe defaults.
-- The backfill statements are idempotent and safe to re-run by hand.

-- ─── 1. Extend existing enums ───────────────────────────────────────────────
ALTER TYPE "DayOfWeek" ADD VALUE IF NOT EXISTS 'SUNDAY';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'AWAITING_REVIEW';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ─── 2. New enums, tables, indexes and foreign keys ─────────────────────────
-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SolveStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'INFEASIBLE', 'INVALID');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GenerationSource" AS ENUM ('GENERATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ConflictKind" AS ENUM ('HARD', 'UNASSIGNED', 'INFEASIBLE');

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('UNAVAILABLE', 'PREFERRED');

-- CreateTable
CREATE TABLE "institutions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "address" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" SERIAL NOT NULL,
    "institutionId" INTEGER NOT NULL,
    "label" VARCHAR(20) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "workingDays" "DayOfWeek"[] DEFAULT ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']::"DayOfWeek"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semester_periods" (
    "id" SERIAL NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "index" SMALLINT NOT NULL,
    "label" VARCHAR(30) NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "semester_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" SERIAL NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "level" VARCHAR(30),
    "durationYears" SMALLINT NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "credits" DECIMAL(4, 1) NOT NULL,
    "type" "CourseType" NOT NULL,
    "defaultSessionsPerWeek" SMALLINT NOT NULL DEFAULT 3,
    "defaultBlockLength" SMALLINT NOT NULL DEFAULT 1,
    "requiredRoomType" "RoomType" NOT NULL DEFAULT 'CLASSROOM',
    "requiredEquipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "yearOfStudy" SMALLINT NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "strength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_batches" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "strength" INTEGER NOT NULL,
    CONSTRAINT "section_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_profiles" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "employeeCode" VARCHAR(30),
    "designation" VARCHAR(100),
    "maxPeriodsPerWeek" SMALLINT NOT NULL DEFAULT 20,
    "maxConsecutive" SMALLINT NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "faculty_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_subjects" (
    "id" SERIAL NOT NULL,
    "facultyProfileId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    CONSTRAINT "faculty_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_availability" (
    "id" SERIAL NOT NULL,
    "facultyProfileId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "day" "DayOfWeek" NOT NULL,
    "periodIndex" SMALLINT NOT NULL,
    "kind" "AvailabilityKind" NOT NULL,
    CONSTRAINT "faculty_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_availability" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "day" "DayOfWeek" NOT NULL,
    "periodIndex" SMALLINT NOT NULL,
    CONSTRAINT "room_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_requirements" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "subjectId" INTEGER NOT NULL,
    "assignedFacultyId" INTEGER,
    "sessionsPerWeek" SMALLINT NOT NULL,
    "blockLength" SMALLINT NOT NULL DEFAULT 1,
    "roomType" "RoomType" NOT NULL DEFAULT 'CLASSROOM',
    "requiredEquipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subject_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_generations" (
    "id" SERIAL NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(200),
    "source" "GenerationSource" NOT NULL DEFAULT 'GENERATED',
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "solveStatus" "SolveStatus",
    "publishStatus" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "sectionIds" INTEGER[],
    "config" JSONB NOT NULL,
    "jobId" VARCHAR(100),
    "progress" SMALLINT NOT NULL DEFAULT 0,
    "progressMessage" VARCHAR(300),
    "score" DOUBLE PRECISION,
    "totalSessions" INTEGER,
    "assignedSessions" INTEGER,
    "penalties" JSONB,
    "stats" JSONB,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdById" INTEGER NOT NULL,
    "publishedById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timetable_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" SERIAL NOT NULL,
    "generationId" INTEGER NOT NULL,
    "requirementId" INTEGER,
    "sessionIndex" SMALLINT NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "subjectId" INTEGER NOT NULL,
    "facultyProfileId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "day" "DayOfWeek" NOT NULL,
    "startPeriod" SMALLINT NOT NULL,
    "length" SMALLINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_conflicts" (
    "id" SERIAL NOT NULL,
    "generationId" INTEGER NOT NULL,
    "kind" "ConflictKind" NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "requirementId" INTEGER,
    "sectionId" INTEGER,
    "facultyProfileId" INTEGER,
    "roomId" INTEGER,
    "day" "DayOfWeek",
    "periodIndex" SMALLINT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutions_code_key" ON "institutions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_institutionId_label_key" ON "academic_years"("institutionId", "label");

-- CreateIndex
CREATE INDEX "academic_years_institutionId_idx" ON "academic_years"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_academicYearId_name_key" ON "semesters"("academicYearId", "name");

-- CreateIndex
CREATE INDEX "semesters_academicYearId_idx" ON "semesters"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "semester_periods_semesterId_index_key" ON "semester_periods"("semesterId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_semesterId_date_key" ON "holidays"("semesterId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "programs_departmentId_code_key" ON "programs"("departmentId", "code");

-- CreateIndex
CREATE INDEX "programs_departmentId_idx" ON "programs"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_departmentId_code_key" ON "subjects"("departmentId", "code");

-- CreateIndex
CREATE INDEX "subjects_departmentId_idx" ON "subjects"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sections_programId_semesterId_yearOfStudy_name_key" ON "sections"("programId", "semesterId", "yearOfStudy", "name");

-- CreateIndex
CREATE INDEX "sections_semesterId_idx" ON "sections"("semesterId");

-- CreateIndex
CREATE INDEX "sections_programId_idx" ON "sections"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "section_batches_sectionId_name_key" ON "section_batches"("sectionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_profiles_userId_key" ON "faculty_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_profiles_employeeCode_key" ON "faculty_profiles"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_subjects_facultyProfileId_subjectId_key" ON "faculty_subjects"("facultyProfileId", "subjectId");

-- CreateIndex
CREATE INDEX "faculty_subjects_subjectId_idx" ON "faculty_subjects"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_availability_slot_key" ON "faculty_availability"("facultyProfileId", "semesterId", "day", "periodIndex");

-- CreateIndex
CREATE INDEX "faculty_availability_semesterId_idx" ON "faculty_availability"("semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "room_availability_roomId_semesterId_day_periodIndex_key" ON "room_availability"("roomId", "semesterId", "day", "periodIndex");

-- CreateIndex
CREATE INDEX "room_availability_semesterId_idx" ON "room_availability"("semesterId");

-- CreateIndex
CREATE INDEX "subject_requirements_sectionId_idx" ON "subject_requirements"("sectionId");

-- CreateIndex
CREATE INDEX "subject_requirements_subjectId_idx" ON "subject_requirements"("subjectId");

-- CreateIndex
CREATE INDEX "subject_requirements_batchId_idx" ON "subject_requirements"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_generations_semesterId_version_key" ON "timetable_generations"("semesterId", "version");

-- CreateIndex
CREATE INDEX "timetable_generations_semesterId_publishStatus_idx" ON "timetable_generations"("semesterId", "publishStatus");

-- CreateIndex
CREATE INDEX "timetable_generations_status_idx" ON "timetable_generations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_generationId_requirementId_sessionIndex_key" ON "timetable_entries"("generationId", "requirementId", "sessionIndex");

-- CreateIndex
CREATE INDEX "timetable_entries_generationId_day_startPeriod_idx" ON "timetable_entries"("generationId", "day", "startPeriod");

-- CreateIndex
CREATE INDEX "timetable_entries_roomId_idx" ON "timetable_entries"("roomId");

-- CreateIndex
CREATE INDEX "timetable_entries_facultyProfileId_idx" ON "timetable_entries"("facultyProfileId");

-- CreateIndex
CREATE INDEX "timetable_entries_sectionId_idx" ON "timetable_entries"("sectionId");

-- CreateIndex
CREATE INDEX "generation_conflicts_generationId_kind_idx" ON "generation_conflicts"("generationId", "kind");

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_periods" ADD CONSTRAINT "semester_periods_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_batches" ADD CONSTRAINT "section_batches_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_profiles" ADD CONSTRAINT "faculty_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_subjects" ADD CONSTRAINT "faculty_subjects_facultyProfileId_fkey" FOREIGN KEY ("facultyProfileId") REFERENCES "faculty_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_subjects" ADD CONSTRAINT "faculty_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_availability" ADD CONSTRAINT "faculty_availability_facultyProfileId_fkey" FOREIGN KEY ("facultyProfileId") REFERENCES "faculty_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_availability" ADD CONSTRAINT "faculty_availability_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_availability" ADD CONSTRAINT "room_availability_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_availability" ADD CONSTRAINT "room_availability_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_requirements" ADD CONSTRAINT "subject_requirements_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_requirements" ADD CONSTRAINT "subject_requirements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "section_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_requirements" ADD CONSTRAINT "subject_requirements_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_requirements" ADD CONSTRAINT "subject_requirements_assignedFacultyId_fkey" FOREIGN KEY ("assignedFacultyId") REFERENCES "faculty_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_generations" ADD CONSTRAINT "timetable_generations_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "timetable_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "subject_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "section_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_facultyProfileId_fkey" FOREIGN KEY ("facultyProfileId") REFERENCES "faculty_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_conflicts" ADD CONSTRAINT "generation_conflicts_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "timetable_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── 3. Alter existing tables ───────────────────────────────────────────────
-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "building" VARCHAR(100),
ADD COLUMN "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ingestion_jobs" ADD COLUMN "payload" JSONB,
ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "semesterId" INTEGER,
ADD COLUMN "createdById" INTEGER,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "committedGenerationId" INTEGER;

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "programId" INTEGER;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "subjectId" INTEGER;

-- AlterTable (institutionId is added nullable, backfilled in section 4, then made NOT NULL)
ALTER TABLE "departments" ADD COLUMN "institutionId" INTEGER;

-- ─── 4. Backfill (idempotent) ───────────────────────────────────────────────
-- 4a. Default institution; every existing department joins it.
INSERT INTO "institutions" ("name", "code", "updatedAt")
VALUES ('Default Institution', 'DEFAULT', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "departments"
SET "institutionId" = (SELECT "id" FROM "institutions" WHERE "code" = 'DEFAULT')
WHERE "institutionId" IS NULL;

ALTER TABLE "departments" ALTER COLUMN "institutionId" SET NOT NULL;

-- 4b. Every legacy Branch becomes a Program (same code/name/department) and is linked to it.
INSERT INTO "programs" ("departmentId", "code", "name")
SELECT b."departmentId", b."code", b."name" FROM "branches" b
ON CONFLICT ("departmentId", "code") DO NOTHING;

UPDATE "branches" b
SET "programId" = p."id"
FROM "programs" p
WHERE p."departmentId" = b."departmentId" AND p."code" = b."code" AND b."programId" IS NULL;

-- 4c. Every distinct (department, course code) becomes a Subject. When several legacy courses
--     share a code inside one department, the lowest-id course supplies name/credits/type.
INSERT INTO "subjects" ("departmentId", "code", "name", "credits", "type",
                        "defaultSessionsPerWeek", "defaultBlockLength", "requiredRoomType", "updatedAt")
SELECT DISTINCT ON (b."departmentId", c."code")
       b."departmentId", c."code", c."name", c."credits", c."type",
       CASE WHEN c."type" = 'LAB' THEN 1 ELSE GREATEST(1, LEAST(CEIL(c."credits")::int, 6)) END,
       CASE WHEN c."type" = 'LAB' THEN 2 ELSE 1 END,
       CASE WHEN c."type" = 'LAB' THEN 'LAB'::"RoomType" ELSE 'CLASSROOM'::"RoomType" END,
       CURRENT_TIMESTAMP
FROM "courses" c JOIN "branches" b ON b."id" = c."branchId"
ORDER BY b."departmentId", c."code", c."id"
ON CONFLICT ("departmentId", "code") DO NOTHING;

UPDATE "courses" c
SET "subjectId" = s."id"
FROM "subjects" s, "branches" b
WHERE b."id" = c."branchId" AND s."departmentId" = b."departmentId" AND s."code" = c."code"
  AND c."subjectId" IS NULL;

-- 4d. Teaching accounts get a FacultyProfile (ADMIN and DEAN do not teach by default).
INSERT INTO "faculty_profiles" ("userId", "updatedAt")
SELECT u."id", CURRENT_TIMESTAMP FROM "users" u
WHERE u."isDeleted" = false AND u."role" IN ('PROFESSOR', 'HOD', 'COORDINATOR')
ON CONFLICT ("userId") DO NOTHING;

-- 4e. Infer qualifications from who has already been teaching what in the legacy timetable.
INSERT INTO "faculty_subjects" ("facultyProfileId", "subjectId")
SELECT DISTINCT fp."id", c."subjectId"
FROM "timetable_slots" ts
JOIN "courses" c ON c."id" = ts."courseId"
JOIN "faculty_profiles" fp ON fp."userId" = ts."facultyId"
WHERE c."subjectId" IS NOT NULL
ON CONFLICT ("facultyProfileId", "subjectId") DO NOTHING;

-- ─── 5. Indexes and foreign keys for altered tables ─────────────────────────
-- CreateIndex
CREATE INDEX "departments_institutionId_idx" ON "departments"("institutionId");
CREATE INDEX "branches_programId_idx" ON "branches"("programId");
CREATE INDEX "courses_subjectId_idx" ON "courses"("subjectId");
CREATE INDEX "ingestion_jobs_semesterId_idx" ON "ingestion_jobs"("semesterId");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
