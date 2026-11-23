-- Baseline: schema as it existed before the academic-model work (commit b4534d8).
-- Existing databases created with `prisma db push` must mark this as applied:
--   npx prisma migrate resolve --applied 0_init

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DEAN', 'HOD', 'COORDINATOR', 'PROFESSOR');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('CLASSROOM', 'LAB', 'OTHER');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('LECTURE', 'LAB', 'TUTORIAL');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "Period" AS ENUM ('I', 'II', 'III', 'IV', 'V', 'VII', 'VIII', 'IX');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" SERIAL NOT NULL,
    "roomNumber" VARCHAR(50) NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "capacity" INTEGER,
    "type" "RoomType" NOT NULL DEFAULT 'CLASSROOM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "credits" DECIMAL(4, 1) NOT NULL,
    "type" "CourseType" NOT NULL,
    "branchId" INTEGER NOT NULL,
    "semester" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(72) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PROFESSOR',
    "departmentId" INTEGER NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "facultyId" INTEGER,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "period" "Period" NOT NULL,
    "semester" SMALLINT NOT NULL,
    "branch" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "filename" VARCHAR(500),
    "totalRows" INTEGER,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "matchedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_name_idx" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_code_idx" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_departmentId_key" ON "branches"("code", "departmentId");

-- CreateIndex
CREATE INDEX "branches_departmentId_idx" ON "branches"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_roomNumber_departmentId_key" ON "rooms"("roomNumber", "departmentId");

-- CreateIndex
CREATE INDEX "rooms_departmentId_idx" ON "rooms"("departmentId");

-- CreateIndex
CREATE INDEX "rooms_type_idx" ON "rooms"("type");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_branchId_semester_key" ON "courses"("code", "branchId", "semester");

-- CreateIndex
CREATE INDEX "courses_branchId_idx" ON "courses"("branchId");

-- CreateIndex
CREATE INDEX "courses_semester_idx" ON "courses"("semester");

-- CreateIndex
CREATE INDEX "courses_code_idx" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isDeleted_idx" ON "users"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_roomId_dayOfWeek_period_semester_branch_key" ON "timetable_slots"("roomId", "dayOfWeek", "period", "semester", "branch");

-- CreateIndex
CREATE INDEX "timetable_slots_courseId_idx" ON "timetable_slots"("courseId");

-- CreateIndex
CREATE INDEX "timetable_slots_roomId_idx" ON "timetable_slots"("roomId");

-- CreateIndex
CREATE INDEX "timetable_slots_facultyId_idx" ON "timetable_slots"("facultyId");

-- CreateIndex
CREATE INDEX "timetable_slots_dayOfWeek_idx" ON "timetable_slots"("dayOfWeek");

-- CreateIndex
CREATE INDEX "timetable_slots_period_idx" ON "timetable_slots"("period");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs"("status");

-- CreateIndex
CREATE INDEX "ingestion_jobs_type_idx" ON "ingestion_jobs"("type");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

