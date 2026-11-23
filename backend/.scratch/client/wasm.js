
Object.defineProperty(exports, "__esModule", { value: true });

const {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  NotFoundError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  objectEnumValues,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime
} = require('./runtime/wasm.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = PrismaClientKnownRequestError;
Prisma.PrismaClientUnknownRequestError = PrismaClientUnknownRequestError
Prisma.PrismaClientRustPanicError = PrismaClientRustPanicError
Prisma.PrismaClientInitializationError = PrismaClientInitializationError
Prisma.PrismaClientValidationError = PrismaClientValidationError
Prisma.NotFoundError = NotFoundError
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = sqltag
Prisma.empty = empty
Prisma.join = join
Prisma.raw = raw
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = Extensions.getExtensionContext
Prisma.defineExtension = Extensions.defineExtension

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}





/**
 * Enums
 */
exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.DepartmentScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  institutionId: 'institutionId'
};

exports.Prisma.BranchScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  departmentId: 'departmentId',
  createdAt: 'createdAt',
  programId: 'programId'
};

exports.Prisma.RoomScalarFieldEnum = {
  id: 'id',
  roomNumber: 'roomNumber',
  departmentId: 'departmentId',
  capacity: 'capacity',
  type: 'type',
  building: 'building',
  equipment: 'equipment',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CourseScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  credits: 'credits',
  type: 'type',
  branchId: 'branchId',
  semester: 'semester',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  subjectId: 'subjectId'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  name: 'name',
  email: 'email',
  passwordHash: 'passwordHash',
  role: 'role',
  departmentId: 'departmentId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TimetableSlotScalarFieldEnum = {
  id: 'id',
  courseId: 'courseId',
  roomId: 'roomId',
  facultyId: 'facultyId',
  dayOfWeek: 'dayOfWeek',
  period: 'period',
  semester: 'semester',
  branch: 'branch',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.IngestionJobScalarFieldEnum = {
  id: 'id',
  type: 'type',
  status: 'status',
  filename: 'filename',
  totalRows: 'totalRows',
  createdRows: 'createdRows',
  matchedRows: 'matchedRows',
  failedRows: 'failedRows',
  errorLog: 'errorLog',
  createdAt: 'createdAt',
  completedAt: 'completedAt',
  payload: 'payload',
  progress: 'progress',
  semesterId: 'semesterId',
  createdById: 'createdById',
  reviewedAt: 'reviewedAt',
  committedGenerationId: 'committedGenerationId'
};

exports.Prisma.InstitutionScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  timezone: 'timezone',
  address: 'address',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AcademicYearScalarFieldEnum = {
  id: 'id',
  institutionId: 'institutionId',
  label: 'label',
  startDate: 'startDate',
  endDate: 'endDate',
  isCurrent: 'isCurrent',
  createdAt: 'createdAt'
};

exports.Prisma.SemesterScalarFieldEnum = {
  id: 'id',
  academicYearId: 'academicYearId',
  name: 'name',
  startDate: 'startDate',
  endDate: 'endDate',
  workingDays: 'workingDays',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SemesterPeriodScalarFieldEnum = {
  id: 'id',
  semesterId: 'semesterId',
  index: 'index',
  label: 'label',
  startTime: 'startTime',
  endTime: 'endTime',
  isBreak: 'isBreak'
};

exports.Prisma.HolidayScalarFieldEnum = {
  id: 'id',
  semesterId: 'semesterId',
  date: 'date',
  name: 'name'
};

exports.Prisma.ProgramScalarFieldEnum = {
  id: 'id',
  departmentId: 'departmentId',
  code: 'code',
  name: 'name',
  level: 'level',
  durationYears: 'durationYears',
  createdAt: 'createdAt'
};

exports.Prisma.SubjectScalarFieldEnum = {
  id: 'id',
  departmentId: 'departmentId',
  code: 'code',
  name: 'name',
  credits: 'credits',
  type: 'type',
  defaultSessionsPerWeek: 'defaultSessionsPerWeek',
  defaultBlockLength: 'defaultBlockLength',
  requiredRoomType: 'requiredRoomType',
  requiredEquipment: 'requiredEquipment',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SectionScalarFieldEnum = {
  id: 'id',
  programId: 'programId',
  semesterId: 'semesterId',
  yearOfStudy: 'yearOfStudy',
  name: 'name',
  strength: 'strength',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SectionBatchScalarFieldEnum = {
  id: 'id',
  sectionId: 'sectionId',
  name: 'name',
  strength: 'strength'
};

exports.Prisma.FacultyProfileScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  employeeCode: 'employeeCode',
  designation: 'designation',
  maxPeriodsPerWeek: 'maxPeriodsPerWeek',
  maxConsecutive: 'maxConsecutive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FacultySubjectScalarFieldEnum = {
  id: 'id',
  facultyProfileId: 'facultyProfileId',
  subjectId: 'subjectId'
};

exports.Prisma.FacultyAvailabilityScalarFieldEnum = {
  id: 'id',
  facultyProfileId: 'facultyProfileId',
  semesterId: 'semesterId',
  day: 'day',
  periodIndex: 'periodIndex',
  kind: 'kind'
};

exports.Prisma.RoomAvailabilityScalarFieldEnum = {
  id: 'id',
  roomId: 'roomId',
  semesterId: 'semesterId',
  day: 'day',
  periodIndex: 'periodIndex'
};

exports.Prisma.SubjectRequirementScalarFieldEnum = {
  id: 'id',
  sectionId: 'sectionId',
  batchId: 'batchId',
  subjectId: 'subjectId',
  assignedFacultyId: 'assignedFacultyId',
  sessionsPerWeek: 'sessionsPerWeek',
  blockLength: 'blockLength',
  roomType: 'roomType',
  requiredEquipment: 'requiredEquipment',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TimetableGenerationScalarFieldEnum = {
  id: 'id',
  semesterId: 'semesterId',
  version: 'version',
  name: 'name',
  source: 'source',
  status: 'status',
  solveStatus: 'solveStatus',
  publishStatus: 'publishStatus',
  sectionIds: 'sectionIds',
  config: 'config',
  jobId: 'jobId',
  progress: 'progress',
  progressMessage: 'progressMessage',
  score: 'score',
  totalSessions: 'totalSessions',
  assignedSessions: 'assignedSessions',
  penalties: 'penalties',
  stats: 'stats',
  durationMs: 'durationMs',
  errorMessage: 'errorMessage',
  createdById: 'createdById',
  publishedById: 'publishedById',
  publishedAt: 'publishedAt',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TimetableEntryScalarFieldEnum = {
  id: 'id',
  generationId: 'generationId',
  requirementId: 'requirementId',
  sessionIndex: 'sessionIndex',
  sectionId: 'sectionId',
  batchId: 'batchId',
  subjectId: 'subjectId',
  facultyProfileId: 'facultyProfileId',
  roomId: 'roomId',
  day: 'day',
  startPeriod: 'startPeriod',
  length: 'length',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.GenerationConflictScalarFieldEnum = {
  id: 'id',
  generationId: 'generationId',
  kind: 'kind',
  code: 'code',
  message: 'message',
  requirementId: 'requirementId',
  sectionId: 'sectionId',
  facultyProfileId: 'facultyProfileId',
  roomId: 'roomId',
  day: 'day',
  periodIndex: 'periodIndex',
  details: 'details',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.RoomType = exports.$Enums.RoomType = {
  CLASSROOM: 'CLASSROOM',
  LAB: 'LAB',
  OTHER: 'OTHER'
};

exports.CourseType = exports.$Enums.CourseType = {
  LECTURE: 'LECTURE',
  LAB: 'LAB',
  TUTORIAL: 'TUTORIAL'
};

exports.Role = exports.$Enums.Role = {
  ADMIN: 'ADMIN',
  DEAN: 'DEAN',
  HOD: 'HOD',
  COORDINATOR: 'COORDINATOR',
  PROFESSOR: 'PROFESSOR'
};

exports.DayOfWeek = exports.$Enums.DayOfWeek = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY'
};

exports.Period = exports.$Enums.Period = {
  I: 'I',
  II: 'II',
  III: 'III',
  IV: 'IV',
  V: 'V',
  VII: 'VII',
  VIII: 'VIII',
  IX: 'IX'
};

exports.JobStatus = exports.$Enums.JobStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  AWAITING_REVIEW: 'AWAITING_REVIEW',
  CANCELLED: 'CANCELLED'
};

exports.AvailabilityKind = exports.$Enums.AvailabilityKind = {
  UNAVAILABLE: 'UNAVAILABLE',
  PREFERRED: 'PREFERRED'
};

exports.GenerationSource = exports.$Enums.GenerationSource = {
  GENERATED: 'GENERATED',
  IMPORTED: 'IMPORTED'
};

exports.GenerationStatus = exports.$Enums.GenerationStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

exports.SolveStatus = exports.$Enums.SolveStatus = {
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
  INFEASIBLE: 'INFEASIBLE',
  INVALID: 'INVALID'
};

exports.PublishStatus = exports.$Enums.PublishStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED'
};

exports.ConflictKind = exports.$Enums.ConflictKind = {
  HARD: 'HARD',
  UNASSIGNED: 'UNASSIGNED',
  INFEASIBLE: 'INFEASIBLE'
};

exports.Prisma.ModelName = {
  Department: 'Department',
  Branch: 'Branch',
  Room: 'Room',
  Course: 'Course',
  User: 'User',
  TimetableSlot: 'TimetableSlot',
  IngestionJob: 'IngestionJob',
  Institution: 'Institution',
  AcademicYear: 'AcademicYear',
  Semester: 'Semester',
  SemesterPeriod: 'SemesterPeriod',
  Holiday: 'Holiday',
  Program: 'Program',
  Subject: 'Subject',
  Section: 'Section',
  SectionBatch: 'SectionBatch',
  FacultyProfile: 'FacultyProfile',
  FacultySubject: 'FacultySubject',
  FacultyAvailability: 'FacultyAvailability',
  RoomAvailability: 'RoomAvailability',
  SubjectRequirement: 'SubjectRequirement',
  TimetableGeneration: 'TimetableGeneration',
  TimetableEntry: 'TimetableEntry',
  GenerationConflict: 'GenerationConflict'
};
/**
 * Create the Client
 */
const config = {
  "generator": {
    "name": "client",
    "provider": {
      "fromEnvVar": null,
      "value": "prisma-client-js"
    },
    "output": {
      "value": "/home/claude/institutional-schedule-resource-optimization-engine/backend/.scratch/client",
      "fromEnvVar": null
    },
    "config": {
      "engineType": "library"
    },
    "binaryTargets": [
      {
        "fromEnvVar": null,
        "value": "debian-openssl-3.0.x",
        "native": true
      }
    ],
    "previewFeatures": [
      "driverAdapters"
    ],
    "sourceFilePath": "/home/claude/institutional-schedule-resource-optimization-engine/backend/.scratch/schema.prisma",
    "isCustomOutput": true
  },
  "relativeEnvPaths": {
    "rootEnvPath": null
  },
  "relativePath": "..",
  "clientVersion": "5.22.0",
  "engineVersion": "605197351a3c8bdd595af2d2a9bc3025bca48ea2",
  "datasourceNames": [
    "db"
  ],
  "activeProvider": "postgresql",
  "postinstall": false,
  "inlineDatasources": {
    "db": {
      "url": {
        "fromEnvVar": "DATABASE_URL",
        "value": null
      }
    }
  },
  "inlineSchema": "// Samayak Admin Panel - Prisma Schema\n// PostgreSQL with strict FK constraints and explicit indexing\n\ngenerator client {\n  provider        = \"prisma-client-js\"\n  previewFeatures = [\"driverAdapters\"]\n  output          = \"./client\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n\n// ─── ENUMS ───────────────────────────────────────────────────────────────────\n\nenum Role {\n  ADMIN\n  DEAN\n  HOD\n  COORDINATOR\n  PROFESSOR\n}\n\nenum RoomType {\n  CLASSROOM\n  LAB\n  OTHER\n}\n\nenum CourseType {\n  LECTURE\n  LAB\n  TUTORIAL\n}\n\nenum DayOfWeek {\n  MONDAY\n  TUESDAY\n  WEDNESDAY\n  THURSDAY\n  FRIDAY\n  SATURDAY\n  SUNDAY\n}\n\nenum Period {\n  I\n  II\n  III\n  IV\n  V\n  VII\n  VIII\n  IX\n}\n\nenum JobStatus {\n  QUEUED\n  PROCESSING\n  DONE\n  FAILED\n  AWAITING_REVIEW // PDF extraction finished; a human must review before anything is persisted\n  CANCELLED\n}\n\nenum GenerationStatus {\n  QUEUED\n  RUNNING\n  COMPLETED\n  FAILED\n  CANCELLED\n}\n\n/// Outcome reported by the scheduling engine (see backend/src/scheduler/types.ts).\nenum SolveStatus {\n  COMPLETE\n  PARTIAL\n  INFEASIBLE\n  INVALID\n}\n\nenum PublishStatus {\n  DRAFT\n  PUBLISHED\n  ARCHIVED\n}\n\nenum GenerationSource {\n  GENERATED\n  IMPORTED // created from a reviewed PDF ingestion\n}\n\nenum ConflictKind {\n  HARD // a hard-constraint violation in the stored entries\n  UNASSIGNED // a required session that could not be placed\n  INFEASIBLE // a counting-argument proof that a full timetable cannot exist\n}\n\nenum AvailabilityKind {\n  UNAVAILABLE\n  PREFERRED\n}\n\n// ─── DEPARTMENT ───────────────────────────────────────────────────────────────\n\nmodel Department {\n  id        Int      @id @default(autoincrement())\n  name      String   @db.VarChar(200)\n  code      String   @unique @db.VarChar(20)\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  institutionId Int\n  institution   Institution @relation(fields: [institutionId], references: [id], onDelete: Restrict)\n\n  branches Branch[]\n  rooms    Room[]\n  users    User[]\n  programs Program[]\n  subjects Subject[]\n\n  @@index([name])\n  @@index([code])\n  @@index([institutionId])\n  @@map(\"departments\")\n}\n\n// ─── BRANCH ───────────────────────────────────────────────────────────────────\n\nmodel Branch {\n  id           Int      @id @default(autoincrement())\n  name         String   @db.VarChar(200)\n  code         String   @db.VarChar(20)\n  departmentId Int\n  createdAt    DateTime @default(now())\n\n  /// Compatibility: every legacy Branch is backfilled to a Program (see migration 20261123000000).\n  programId Int?\n  program   Program? @relation(fields: [programId], references: [id], onDelete: SetNull)\n\n  department Department @relation(fields: [departmentId], references: [id], onDelete: Restrict)\n  courses    Course[]\n\n  @@unique([code, departmentId])\n  @@index([departmentId])\n  @@index([programId])\n  @@map(\"branches\")\n}\n\n// ─── ROOM ─────────────────────────────────────────────────────────────────────\n\nmodel Room {\n  id           Int      @id @default(autoincrement())\n  roomNumber   String   @db.VarChar(50)\n  departmentId Int\n  capacity     Int?\n  type         RoomType @default(CLASSROOM)\n  building     String?  @db.VarChar(100)\n  /// Equipment tags, e.g. [\"projector\",\"linux-pcs\"]. Matched against Subject.requiredEquipment.\n  equipment    String[] @default([])\n  isActive     Boolean  @default(true)\n  createdAt    DateTime @default(now())\n  updatedAt    DateTime @updatedAt\n\n  department   Department         @relation(fields: [departmentId], references: [id], onDelete: Restrict)\n  slots        TimetableSlot[]\n  availability RoomAvailability[]\n  entries      TimetableEntry[]\n\n  // Composite unique: same room number can exist in different departments\n  @@unique([roomNumber, departmentId])\n  @@index([departmentId])\n  @@index([type])\n  @@map(\"rooms\")\n}\n\n// ─── COURSE ───────────────────────────────────────────────────────────────────\n\nmodel Course {\n  id       Int        @id @default(autoincrement())\n  code     String     @db.VarChar(20)\n  name     String     @db.VarChar(300)\n  credits  Decimal    @db.Decimal(4, 1) // supports NC=0, 1.5, 2, 3, 4\n  type     CourseType\n  branchId Int\n  semester Int        @db.SmallInt\n\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  /// Compatibility: every legacy Course is backfilled to a Subject (see migration 20261123000000).\n  subjectId Int?\n  subject   Subject? @relation(fields: [subjectId], references: [id], onDelete: SetNull)\n\n  branch Branch          @relation(fields: [branchId], references: [id], onDelete: Restrict)\n  slots  TimetableSlot[]\n\n  @@unique([code, branchId, semester])\n  @@index([subjectId])\n  @@index([branchId])\n  @@index([semester])\n  @@index([code])\n  @@map(\"courses\")\n}\n\n// ─── USER / FACULTY ───────────────────────────────────────────────────────────\n\nmodel User {\n  id           Int       @id @default(autoincrement())\n  name         String    @db.VarChar(200)\n  email        String    @unique @db.VarChar(320)\n  passwordHash String    @db.VarChar(72)\n  role         Role      @default(PROFESSOR)\n  departmentId Int\n  isDeleted    Boolean   @default(false)\n  deletedAt    DateTime?\n  createdAt    DateTime  @default(now())\n  updatedAt    DateTime  @updatedAt\n\n  department     Department      @relation(fields: [departmentId], references: [id], onDelete: Restrict)\n  slots          TimetableSlot[]\n  facultyProfile FacultyProfile?\n\n  @@index([email])\n  @@index([departmentId])\n  @@index([role])\n  @@index([isDeleted])\n  @@map(\"users\")\n}\n\n// ─── TIMETABLE SLOT ───────────────────────────────────────────────────────────\n\nmodel TimetableSlot {\n  id        Int       @id @default(autoincrement())\n  courseId  Int\n  roomId    Int\n  facultyId Int?\n  dayOfWeek DayOfWeek\n  period    Period\n  semester  Int       @db.SmallInt\n  branch    String    @db.VarChar(20)\n  createdAt DateTime  @default(now())\n  updatedAt DateTime  @updatedAt\n\n  course  Course @relation(fields: [courseId], references: [id], onDelete: Cascade)\n  room    Room   @relation(fields: [roomId], references: [id], onDelete: Restrict)\n  faculty User?  @relation(fields: [facultyId], references: [id], onDelete: SetNull)\n\n  @@unique([roomId, dayOfWeek, period, semester, branch])\n  @@index([courseId])\n  @@index([roomId])\n  @@index([facultyId])\n  @@index([dayOfWeek])\n  @@index([period])\n  @@map(\"timetable_slots\")\n}\n\n// ─── INGESTION JOB ────────────────────────────────────────────────────────────\n\nmodel IngestionJob {\n  id          String    @id @default(uuid())\n  type        String    @db.VarChar(50)\n  status      JobStatus @default(QUEUED)\n  filename    String?   @db.VarChar(500)\n  totalRows   Int?\n  createdRows Int       @default(0)\n  matchedRows Int       @default(0)\n  failedRows  Int       @default(0)\n  errorLog    Json?\n  createdAt   DateTime  @default(now())\n  completedAt DateTime?\n\n  /// PDF review workflow: extracted rows wait here (editable) until a human commits them.\n  payload               Json?\n  progress              Int       @default(0)\n  semesterId            Int?\n  createdById           Int?\n  reviewedAt            DateTime?\n  committedGenerationId Int?\n\n  @@index([status])\n  @@index([type])\n  @@index([semesterId])\n  @@map(\"ingestion_jobs\")\n}\n\n// ═════════════════════════════════════════════════════════════════════════════\n// ACADEMIC MODEL (additive — introduced in migration 20261123000000_academic_model)\n// ═════════════════════════════════════════════════════════════════════════════\n\n// ─── INSTITUTION / ACADEMIC CALENDAR ─────────────────────────────────────────\n\nmodel Institution {\n  id        Int      @id @default(autoincrement())\n  name      String   @db.VarChar(300)\n  code      String   @unique @db.VarChar(30)\n  timezone  String   @default(\"Asia/Kolkata\") @db.VarChar(64)\n  address   String?  @db.VarChar(500)\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  departments   Department[]\n  academicYears AcademicYear[]\n\n  @@map(\"institutions\")\n}\n\nmodel AcademicYear {\n  id            Int      @id @default(autoincrement())\n  institutionId Int\n  label         String   @db.VarChar(20) // \"2026-27\"\n  startDate     DateTime @db.Date\n  endDate       DateTime @db.Date\n  isCurrent     Boolean  @default(false)\n  createdAt     DateTime @default(now())\n\n  institution Institution @relation(fields: [institutionId], references: [id], onDelete: Restrict)\n  semesters   Semester[]\n\n  @@unique([institutionId, label])\n  @@index([institutionId])\n  @@map(\"academic_years\")\n}\n\n/// A teaching term. Owns the weekly grid: working days, periods (incl. breaks) and holidays.\nmodel Semester {\n  id             Int         @id @default(autoincrement())\n  academicYearId Int\n  name           String      @db.VarChar(100) // \"Odd Semester\"\n  startDate      DateTime    @db.Date\n  endDate        DateTime    @db.Date\n  workingDays    DayOfWeek[] @default([MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY])\n  createdAt      DateTime    @default(now())\n  updatedAt      DateTime    @updatedAt\n\n  academicYear        AcademicYear          @relation(fields: [academicYearId], references: [id], onDelete: Restrict)\n  periods             SemesterPeriod[]\n  holidays            Holiday[]\n  sections            Section[]\n  generations         TimetableGeneration[]\n  facultyAvailability FacultyAvailability[]\n  roomAvailability    RoomAvailability[]\n\n  @@unique([academicYearId, name])\n  @@index([academicYearId])\n  @@map(\"semesters\")\n}\n\n/// One row of the daily bell schedule. `index` is the zero-based position used by the engine.\nmodel SemesterPeriod {\n  id         Int     @id @default(autoincrement())\n  semesterId Int\n  index      Int     @db.SmallInt\n  label      String  @db.VarChar(30)\n  startTime  String  @db.VarChar(5) // \"09:00\"\n  endTime    String  @db.VarChar(5) // \"09:50\"\n  isBreak    Boolean @default(false)\n\n  semester Semester @relation(fields: [semesterId], references: [id], onDelete: Cascade)\n\n  @@unique([semesterId, index])\n  @@map(\"semester_periods\")\n}\n\nmodel Holiday {\n  id         Int      @id @default(autoincrement())\n  semesterId Int\n  date       DateTime @db.Date\n  name       String   @db.VarChar(200)\n\n  semester Semester @relation(fields: [semesterId], references: [id], onDelete: Cascade)\n\n  @@unique([semesterId, date])\n  @@map(\"holidays\")\n}\n\n// ─── PROGRAM / SUBJECT / SECTION ─────────────────────────────────────────────\n\nmodel Program {\n  id            Int      @id @default(autoincrement())\n  departmentId  Int\n  code          String   @db.VarChar(20)\n  name          String   @db.VarChar(200)\n  level         String?  @db.VarChar(30) // UG / PG / Diploma\n  durationYears Int      @default(4) @db.SmallInt\n  createdAt     DateTime @default(now())\n\n  department Department @relation(fields: [departmentId], references: [id], onDelete: Restrict)\n  branches   Branch[]\n  sections   Section[]\n\n  @@unique([departmentId, code])\n  @@index([departmentId])\n  @@map(\"programs\")\n}\n\nmodel Subject {\n  id                     Int        @id @default(autoincrement())\n  departmentId           Int\n  code                   String     @db.VarChar(20)\n  name                   String     @db.VarChar(300)\n  credits                Decimal    @db.Decimal(4, 1)\n  type                   CourseType\n  /// Defaults pre-filled into new SubjectRequirements.\n  defaultSessionsPerWeek Int        @default(3) @db.SmallInt\n  defaultBlockLength     Int        @default(1) @db.SmallInt\n  requiredRoomType       RoomType   @default(CLASSROOM)\n  requiredEquipment      String[]   @default([])\n  createdAt              DateTime   @default(now())\n  updatedAt              DateTime   @updatedAt\n\n  department   Department           @relation(fields: [departmentId], references: [id], onDelete: Restrict)\n  courses      Course[]\n  qualified    FacultySubject[]\n  requirements SubjectRequirement[]\n  entries      TimetableEntry[]\n\n  @@unique([departmentId, code])\n  @@index([departmentId])\n  @@map(\"subjects\")\n}\n\nmodel Section {\n  id          Int      @id @default(autoincrement())\n  programId   Int\n  semesterId  Int\n  yearOfStudy Int      @db.SmallInt\n  name        String   @db.VarChar(20) // \"A\"\n  strength    Int\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  program      Program              @relation(fields: [programId], references: [id], onDelete: Restrict)\n  semester     Semester             @relation(fields: [semesterId], references: [id], onDelete: Restrict)\n  batches      SectionBatch[]\n  requirements SubjectRequirement[]\n  entries      TimetableEntry[]\n\n  @@unique([programId, semesterId, yearOfStudy, name])\n  @@index([semesterId])\n  @@index([programId])\n  @@map(\"sections\")\n}\n\n/// A lab/tutorial batch inside a section. A section with no batches is scheduled as one group.\nmodel SectionBatch {\n  id        Int    @id @default(autoincrement())\n  sectionId Int\n  name      String @db.VarChar(20) // \"B1\"\n  strength  Int\n\n  section      Section              @relation(fields: [sectionId], references: [id], onDelete: Cascade)\n  requirements SubjectRequirement[]\n  entries      TimetableEntry[]\n\n  @@unique([sectionId, name])\n  @@map(\"section_batches\")\n}\n\n// ─── FACULTY ─────────────────────────────────────────────────────────────────\n\nmodel FacultyProfile {\n  id                Int      @id @default(autoincrement())\n  userId            Int      @unique\n  employeeCode      String?  @unique @db.VarChar(30)\n  designation       String?  @db.VarChar(100)\n  maxPeriodsPerWeek Int      @default(20) @db.SmallInt\n  maxConsecutive    Int      @default(3) @db.SmallInt\n  createdAt         DateTime @default(now())\n  updatedAt         DateTime @updatedAt\n\n  user           User                  @relation(fields: [userId], references: [id], onDelete: Cascade)\n  qualifications FacultySubject[]\n  availability   FacultyAvailability[]\n  requirements   SubjectRequirement[]\n  entries        TimetableEntry[]\n\n  @@map(\"faculty_profiles\")\n}\n\nmodel FacultySubject {\n  id               Int @id @default(autoincrement())\n  facultyProfileId Int\n  subjectId        Int\n\n  faculty FacultyProfile @relation(fields: [facultyProfileId], references: [id], onDelete: Cascade)\n  subject Subject        @relation(fields: [subjectId], references: [id], onDelete: Cascade)\n\n  @@unique([facultyProfileId, subjectId])\n  @@index([subjectId])\n  @@map(\"faculty_subjects\")\n}\n\nmodel FacultyAvailability {\n  id               Int              @id @default(autoincrement())\n  facultyProfileId Int\n  semesterId       Int\n  day              DayOfWeek\n  periodIndex      Int              @db.SmallInt\n  kind             AvailabilityKind\n\n  faculty  FacultyProfile @relation(fields: [facultyProfileId], references: [id], onDelete: Cascade)\n  semester Semester       @relation(fields: [semesterId], references: [id], onDelete: Cascade)\n\n  @@unique([facultyProfileId, semesterId, day, periodIndex], map: \"faculty_availability_slot_key\")\n  @@index([semesterId])\n  @@map(\"faculty_availability\")\n}\n\nmodel RoomAvailability {\n  id          Int       @id @default(autoincrement())\n  roomId      Int\n  semesterId  Int\n  day         DayOfWeek\n  periodIndex Int       @db.SmallInt\n\n  room     Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)\n  semester Semester @relation(fields: [semesterId], references: [id], onDelete: Cascade)\n\n  @@unique([roomId, semesterId, day, periodIndex])\n  @@index([semesterId])\n  @@map(\"room_availability\")\n}\n\n// ─── REQUIREMENTS ────────────────────────────────────────────────────────────\n\n/// \"Section X (optionally batch Y) needs Subject Z, N sessions a week, each `blockLength` periods.\"\n/// (sectionId, batchId, subjectId) is unique in the service layer: batchId is nullable and\n/// PostgreSQL treats NULLs as distinct in unique indexes.\nmodel SubjectRequirement {\n  id                Int      @id @default(autoincrement())\n  sectionId         Int\n  batchId           Int?\n  subjectId         Int\n  /// Pins the teacher. When null, every faculty member qualified for the subject is a candidate.\n  assignedFacultyId Int?\n  sessionsPerWeek   Int      @db.SmallInt\n  blockLength       Int      @default(1) @db.SmallInt\n  roomType          RoomType @default(CLASSROOM)\n  requiredEquipment String[] @default([])\n  createdAt         DateTime @default(now())\n  updatedAt         DateTime @updatedAt\n\n  section         Section          @relation(fields: [sectionId], references: [id], onDelete: Cascade)\n  batch           SectionBatch?    @relation(fields: [batchId], references: [id], onDelete: Cascade)\n  subject         Subject          @relation(fields: [subjectId], references: [id], onDelete: Restrict)\n  assignedFaculty FacultyProfile?  @relation(fields: [assignedFacultyId], references: [id], onDelete: SetNull)\n  entries         TimetableEntry[]\n\n  @@index([sectionId])\n  @@index([subjectId])\n  @@index([batchId])\n  @@map(\"subject_requirements\")\n}\n\n// ─── TIMETABLE GENERATION ────────────────────────────────────────────────────\n\nmodel TimetableGeneration {\n  id               Int              @id @default(autoincrement())\n  semesterId       Int\n  /// Per-semester sequence: 1, 2, 3 … (see unique constraint)\n  version          Int\n  name             String?          @db.VarChar(200)\n  source           GenerationSource @default(GENERATED)\n  status           GenerationStatus @default(QUEUED)\n  solveStatus      SolveStatus?\n  publishStatus    PublishStatus    @default(DRAFT)\n  sectionIds       Int[]\n  config           Json\n  jobId            String?          @db.VarChar(100)\n  progress         Int              @default(0) @db.SmallInt\n  progressMessage  String?          @db.VarChar(300)\n  score            Float?\n  totalSessions    Int?\n  assignedSessions Int?\n  penalties        Json?\n  stats            Json?\n  durationMs       Int?\n  errorMessage     String?\n  createdById      Int\n  publishedById    Int?\n  publishedAt      DateTime?\n  startedAt        DateTime?\n  completedAt      DateTime?\n  createdAt        DateTime         @default(now())\n  updatedAt        DateTime         @updatedAt\n\n  semester  Semester             @relation(fields: [semesterId], references: [id], onDelete: Restrict)\n  entries   TimetableEntry[]\n  conflicts GenerationConflict[]\n\n  @@unique([semesterId, version])\n  @@index([semesterId, publishStatus])\n  @@index([status])\n  @@map(\"timetable_generations\")\n}\n\n/// One placed session (a block of `length` consecutive periods). Section/subject are\n/// snapshotted so a generation stays readable if a requirement is later edited or deleted.\nmodel TimetableEntry {\n  id               Int       @id @default(autoincrement())\n  generationId     Int\n  requirementId    Int?\n  sessionIndex     Int       @db.SmallInt\n  sectionId        Int\n  batchId          Int?\n  subjectId        Int\n  facultyProfileId Int\n  roomId           Int\n  day              DayOfWeek\n  startPeriod      Int       @db.SmallInt\n  length           Int       @default(1) @db.SmallInt\n  createdAt        DateTime  @default(now())\n  updatedAt        DateTime  @updatedAt\n\n  generation  TimetableGeneration @relation(fields: [generationId], references: [id], onDelete: Cascade)\n  requirement SubjectRequirement? @relation(fields: [requirementId], references: [id], onDelete: SetNull)\n  section     Section             @relation(fields: [sectionId], references: [id], onDelete: Restrict)\n  batch       SectionBatch?       @relation(fields: [batchId], references: [id], onDelete: SetNull)\n  subject     Subject             @relation(fields: [subjectId], references: [id], onDelete: Restrict)\n  faculty     FacultyProfile      @relation(fields: [facultyProfileId], references: [id], onDelete: Restrict)\n  room        Room                @relation(fields: [roomId], references: [id], onDelete: Restrict)\n\n  @@unique([generationId, requirementId, sessionIndex])\n  @@index([generationId, day, startPeriod])\n  @@index([roomId])\n  @@index([facultyProfileId])\n  @@index([sectionId])\n  @@map(\"timetable_entries\")\n}\n\nmodel GenerationConflict {\n  id               Int          @id @default(autoincrement())\n  generationId     Int\n  kind             ConflictKind\n  code             String       @db.VarChar(50)\n  message          String\n  requirementId    Int?\n  sectionId        Int?\n  facultyProfileId Int?\n  roomId           Int?\n  day              DayOfWeek?\n  periodIndex      Int?         @db.SmallInt\n  details          Json?\n  createdAt        DateTime     @default(now())\n\n  generation TimetableGeneration @relation(fields: [generationId], references: [id], onDelete: Cascade)\n\n  @@index([generationId, kind])\n  @@map(\"generation_conflicts\")\n}\n",
  "inlineSchemaHash": "00c396f4ff6f1ffab43f566c5a61f6221c69d7db09623f1593a54ae2e1737967",
  "copyEngine": true
}
config.dirname = '/'

config.runtimeDataModel = JSON.parse("{\"models\":{\"Department\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"code\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"institutionId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"institution\",\"kind\":\"object\",\"type\":\"Institution\",\"relationName\":\"DepartmentToInstitution\"},{\"name\":\"branches\",\"kind\":\"object\",\"type\":\"Branch\",\"relationName\":\"BranchToDepartment\"},{\"name\":\"rooms\",\"kind\":\"object\",\"type\":\"Room\",\"relationName\":\"DepartmentToRoom\"},{\"name\":\"users\",\"kind\":\"object\",\"type\":\"User\",\"relationName\":\"DepartmentToUser\"},{\"name\":\"programs\",\"kind\":\"object\",\"type\":\"Program\",\"relationName\":\"DepartmentToProgram\"},{\"name\":\"subjects\",\"kind\":\"object\",\"type\":\"Subject\",\"relationName\":\"DepartmentToSubject\"}],\"dbName\":\"departments\"},\"Branch\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"code\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"departmentId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"programId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"program\",\"kind\":\"object\",\"type\":\"Program\",\"relationName\":\"BranchToProgram\"},{\"name\":\"department\",\"kind\":\"object\",\"type\":\"Department\",\"relationName\":\"BranchToDepartment\"},{\"name\":\"courses\",\"kind\":\"object\",\"type\":\"Course\",\"relationName\":\"BranchToCourse\"}],\"dbName\":\"branches\"},\"Room\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"roomNumber\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"departmentId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"capacity\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"type\",\"kind\":\"enum\",\"type\":\"RoomType\"},{\"name\":\"building\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"equipment\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"isActive\",\"kind\":\"scalar\",\"type\":\"Boolean\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"department\",\"kind\":\"object\",\"type\":\"Department\",\"relationName\":\"DepartmentToRoom\"},{\"name\":\"slots\",\"kind\":\"object\",\"type\":\"TimetableSlot\",\"relationName\":\"RoomToTimetableSlot\"},{\"name\":\"availability\",\"kind\":\"object\",\"type\":\"RoomAvailability\",\"relationName\":\"RoomToRoomAvailability\"},{\"name\":\"entries\",\"kind\":\"object\",\"type\":\"TimetableEntry\",\"relationName\":\"RoomToTimetableEntry\"}],\"dbName\":\"rooms\"},\"Course\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"code\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"credits\",\"kind\":\"scalar\",\"type\":\"Decimal\"},{\"name\":\"type\",\"kind\":\"enum\",\"type\":\"CourseType\"},{\"name\":\"branchId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semester\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"subjectId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"subject\",\"kind\":\"object\",\"type\":\"Subject\",\"relationName\":\"CourseToSubject\"},{\"name\":\"branch\",\"kind\":\"object\",\"type\":\"Branch\",\"relationName\":\"BranchToCourse\"},{\"name\":\"slots\",\"kind\":\"object\",\"type\":\"TimetableSlot\",\"relationName\":\"CourseToTimetableSlot\"}],\"dbName\":\"courses\"},\"User\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"email\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"passwordHash\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"role\",\"kind\":\"enum\",\"type\":\"Role\"},{\"name\":\"departmentId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"isDeleted\",\"kind\":\"scalar\",\"type\":\"Boolean\"},{\"name\":\"deletedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"department\",\"kind\":\"object\",\"type\":\"Department\",\"relationName\":\"DepartmentToUser\"},{\"name\":\"slots\",\"kind\":\"object\",\"type\":\"TimetableSlot\",\"relationName\":\"TimetableSlotToUser\"},{\"name\":\"facultyProfile\",\"kind\":\"object\",\"type\":\"FacultyProfile\",\"relationName\":\"FacultyProfileToUser\"}],\"dbName\":\"users\"},\"TimetableSlot\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"courseId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"roomId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"facultyId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"dayOfWeek\",\"kind\":\"enum\",\"type\":\"DayOfWeek\"},{\"name\":\"period\",\"kind\":\"enum\",\"type\":\"Period\"},{\"name\":\"semester\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"branch\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"course\",\"kind\":\"object\",\"type\":\"Course\",\"relationName\":\"CourseToTimetableSlot\"},{\"name\":\"room\",\"kind\":\"object\",\"type\":\"Room\",\"relationName\":\"RoomToTimetableSlot\"},{\"name\":\"faculty\",\"kind\":\"object\",\"type\":\"User\",\"relationName\":\"TimetableSlotToUser\"}],\"dbName\":\"timetable_slots\"},\"IngestionJob\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"type\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"status\",\"kind\":\"enum\",\"type\":\"JobStatus\"},{\"name\":\"filename\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"totalRows\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdRows\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"matchedRows\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"failedRows\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"errorLog\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"completedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"payload\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"progress\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semesterId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdById\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"reviewedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"committedGenerationId\",\"kind\":\"scalar\",\"type\":\"Int\"}],\"dbName\":\"ingestion_jobs\"},\"Institution\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"code\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"timezone\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"address\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"departments\",\"kind\":\"object\",\"type\":\"Department\",\"relationName\":\"DepartmentToInstitution\"},{\"name\":\"academicYears\",\"kind\":\"object\",\"type\":\"AcademicYear\",\"relationName\":\"AcademicYearToInstitution\"}],\"dbName\":\"institutions\"},\"AcademicYear\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"institutionId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"label\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"startDate\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"endDate\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"isCurrent\",\"kind\":\"scalar\",\"type\":\"Boolean\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"institution\",\"kind\":\"object\",\"type\":\"Institution\",\"relationName\":\"AcademicYearToInstitution\"},{\"name\":\"semesters\",\"kind\":\"object\",\"type\":\"Semester\",\"relationName\":\"AcademicYearToSemester\"}],\"dbName\":\"academic_years\"},\"Semester\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"academicYearId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"startDate\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"endDate\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"workingDays\",\"kind\":\"enum\",\"type\":\"DayOfWeek\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"academicYear\",\"kind\":\"object\",\"type\":\"AcademicYear\",\"relationName\":\"AcademicYearToSemester\"},{\"name\":\"periods\",\"kind\":\"object\",\"type\":\"SemesterPeriod\",\"relationName\":\"SemesterToSemesterPeriod\"},{\"name\":\"holidays\",\"kind\":\"object\",\"type\":\"Holiday\",\"relationName\":\"HolidayToSemester\"},{\"name\":\"sections\",\"kind\":\"object\",\"type\":\"Section\",\"relationName\":\"SectionToSemester\"},{\"name\":\"generations\",\"kind\":\"object\",\"type\":\"TimetableGeneration\",\"relationName\":\"SemesterToTimetableGeneration\"},{\"name\":\"facultyAvailability\",\"kind\":\"object\",\"type\":\"FacultyAvailability\",\"relationName\":\"FacultyAvailabilityToSemester\"},{\"name\":\"roomAvailability\",\"kind\":\"object\",\"type\":\"RoomAvailability\",\"relationName\":\"RoomAvailabilityToSemester\"}],\"dbName\":\"semesters\"},\"SemesterPeriod\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semesterId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"index\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"label\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"startTime\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"endTime\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"isBreak\",\"kind\":\"scalar\",\"type\":\"Boolean\"},{\"name\":\"semester\",\"kind\":\"object\",\"type\":\"Semester\",\"relationName\":\"SemesterToSemesterPeriod\"}],\"dbName\":\"semester_periods\"},\"Holiday\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semesterId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"date\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"semester\",\"kind\":\"object\",\"type\":\"Semester\",\"relationName\":\"HolidayToSemester\"}],\"dbName\":\"holidays\"},\"Program\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"departmentId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"code\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"level\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"durationYears\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"department\",\"kind\":\"object\",\"type\":\"Department\",\"relationName\":\"DepartmentToProgram\"},{\"name\":\"branches\",\"kind\":\"object\",\"type\":\"Branch\",\"relationName\":\"BranchToProgram\"},{\"name\":\"sections\",\"kind\":\"object\",\"type\":\"Section\",\"relationName\":\"ProgramToSection\"}],\"dbName\":\"programs\"},\"Subject\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"departmentId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"code\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"credits\",\"kind\":\"scalar\",\"type\":\"Decimal\"},{\"name\":\"type\",\"kind\":\"enum\",\"type\":\"CourseType\"},{\"name\":\"defaultSessionsPerWeek\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"defaultBlockLength\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"requiredRoomType\",\"kind\":\"enum\",\"type\":\"RoomType\"},{\"name\":\"requiredEquipment\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"department\",\"kind\":\"object\",\"type\":\"Department\",\"relationName\":\"DepartmentToSubject\"},{\"name\":\"courses\",\"kind\":\"object\",\"type\":\"Course\",\"relationName\":\"CourseToSubject\"},{\"name\":\"qualified\",\"kind\":\"object\",\"type\":\"FacultySubject\",\"relationName\":\"FacultySubjectToSubject\"},{\"name\":\"requirements\",\"kind\":\"object\",\"type\":\"SubjectRequirement\",\"relationName\":\"SubjectToSubjectRequirement\"},{\"name\":\"entries\",\"kind\":\"object\",\"type\":\"TimetableEntry\",\"relationName\":\"SubjectToTimetableEntry\"}],\"dbName\":\"subjects\"},\"Section\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"programId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semesterId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"yearOfStudy\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"strength\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"program\",\"kind\":\"object\",\"type\":\"Program\",\"relationName\":\"ProgramToSection\"},{\"name\":\"semester\",\"kind\":\"object\",\"type\":\"Semester\",\"relationName\":\"SectionToSemester\"},{\"name\":\"batches\",\"kind\":\"object\",\"type\":\"SectionBatch\",\"relationName\":\"SectionToSectionBatch\"},{\"name\":\"requirements\",\"kind\":\"object\",\"type\":\"SubjectRequirement\",\"relationName\":\"SectionToSubjectRequirement\"},{\"name\":\"entries\",\"kind\":\"object\",\"type\":\"TimetableEntry\",\"relationName\":\"SectionToTimetableEntry\"}],\"dbName\":\"sections\"},\"SectionBatch\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"sectionId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"strength\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"section\",\"kind\":\"object\",\"type\":\"Section\",\"relationName\":\"SectionToSectionBatch\"},{\"name\":\"requirements\",\"kind\":\"object\",\"type\":\"SubjectRequirement\",\"relationName\":\"SectionBatchToSubjectRequirement\"},{\"name\":\"entries\",\"kind\":\"object\",\"type\":\"TimetableEntry\",\"relationName\":\"SectionBatchToTimetableEntry\"}],\"dbName\":\"section_batches\"},\"FacultyProfile\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"userId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"employeeCode\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"designation\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"maxPeriodsPerWeek\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"maxConsecutive\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"user\",\"kind\":\"object\",\"type\":\"User\",\"relationName\":\"FacultyProfileToUser\"},{\"name\":\"qualifications\",\"kind\":\"object\",\"type\":\"FacultySubject\",\"relationName\":\"FacultyProfileToFacultySubject\"},{\"name\":\"availability\",\"kind\":\"object\",\"type\":\"FacultyAvailability\",\"relationName\":\"FacultyAvailabilityToFacultyProfile\"},{\"name\":\"requirements\",\"kind\":\"object\",\"type\":\"SubjectRequirement\",\"relationName\":\"FacultyProfileToSubjectRequirement\"},{\"name\":\"entries\",\"kind\":\"object\",\"type\":\"TimetableEntry\",\"relationName\":\"FacultyProfileToTimetableEntry\"}],\"dbName\":\"faculty_profiles\"},\"FacultySubject\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"facultyProfileId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"subjectId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"faculty\",\"kind\":\"object\",\"type\":\"FacultyProfile\",\"relationName\":\"FacultyProfileToFacultySubject\"},{\"name\":\"subject\",\"kind\":\"object\",\"type\":\"Subject\",\"relationName\":\"FacultySubjectToSubject\"}],\"dbName\":\"faculty_subjects\"},\"FacultyAvailability\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"facultyProfileId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semesterId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"day\",\"kind\":\"enum\",\"type\":\"DayOfWeek\"},{\"name\":\"periodIndex\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"kind\",\"kind\":\"enum\",\"type\":\"AvailabilityKind\"},{\"name\":\"faculty\",\"kind\":\"object\",\"type\":\"FacultyProfile\",\"relationName\":\"FacultyAvailabilityToFacultyProfile\"},{\"name\":\"semester\",\"kind\":\"object\",\"type\":\"Semester\",\"relationName\":\"FacultyAvailabilityToSemester\"}],\"dbName\":\"faculty_availability\"},\"RoomAvailability\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"roomId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semesterId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"day\",\"kind\":\"enum\",\"type\":\"DayOfWeek\"},{\"name\":\"periodIndex\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"room\",\"kind\":\"object\",\"type\":\"Room\",\"relationName\":\"RoomToRoomAvailability\"},{\"name\":\"semester\",\"kind\":\"object\",\"type\":\"Semester\",\"relationName\":\"RoomAvailabilityToSemester\"}],\"dbName\":\"room_availability\"},\"SubjectRequirement\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"sectionId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"batchId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"subjectId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"assignedFacultyId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"sessionsPerWeek\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"blockLength\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"roomType\",\"kind\":\"enum\",\"type\":\"RoomType\"},{\"name\":\"requiredEquipment\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"section\",\"kind\":\"object\",\"type\":\"Section\",\"relationName\":\"SectionToSubjectRequirement\"},{\"name\":\"batch\",\"kind\":\"object\",\"type\":\"SectionBatch\",\"relationName\":\"SectionBatchToSubjectRequirement\"},{\"name\":\"subject\",\"kind\":\"object\",\"type\":\"Subject\",\"relationName\":\"SubjectToSubjectRequirement\"},{\"name\":\"assignedFaculty\",\"kind\":\"object\",\"type\":\"FacultyProfile\",\"relationName\":\"FacultyProfileToSubjectRequirement\"},{\"name\":\"entries\",\"kind\":\"object\",\"type\":\"TimetableEntry\",\"relationName\":\"SubjectRequirementToTimetableEntry\"}],\"dbName\":\"subject_requirements\"},\"TimetableGeneration\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"semesterId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"version\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"source\",\"kind\":\"enum\",\"type\":\"GenerationSource\"},{\"name\":\"status\",\"kind\":\"enum\",\"type\":\"GenerationStatus\"},{\"name\":\"solveStatus\",\"kind\":\"enum\",\"type\":\"SolveStatus\"},{\"name\":\"publishStatus\",\"kind\":\"enum\",\"type\":\"PublishStatus\"},{\"name\":\"sectionIds\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"config\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"jobId\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"progress\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"progressMessage\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"score\",\"kind\":\"scalar\",\"type\":\"Float\"},{\"name\":\"totalSessions\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"assignedSessions\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"penalties\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"stats\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"durationMs\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"errorMessage\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"createdById\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"publishedById\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"publishedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"startedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"completedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"semester\",\"kind\":\"object\",\"type\":\"Semester\",\"relationName\":\"SemesterToTimetableGeneration\"},{\"name\":\"entries\",\"kind\":\"object\",\"type\":\"TimetableEntry\",\"relationName\":\"TimetableEntryToTimetableGeneration\"},{\"name\":\"conflicts\",\"kind\":\"object\",\"type\":\"GenerationConflict\",\"relationName\":\"GenerationConflictToTimetableGeneration\"}],\"dbName\":\"timetable_generations\"},\"TimetableEntry\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"generationId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"requirementId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"sessionIndex\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"sectionId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"batchId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"subjectId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"facultyProfileId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"roomId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"day\",\"kind\":\"enum\",\"type\":\"DayOfWeek\"},{\"name\":\"startPeriod\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"length\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"generation\",\"kind\":\"object\",\"type\":\"TimetableGeneration\",\"relationName\":\"TimetableEntryToTimetableGeneration\"},{\"name\":\"requirement\",\"kind\":\"object\",\"type\":\"SubjectRequirement\",\"relationName\":\"SubjectRequirementToTimetableEntry\"},{\"name\":\"section\",\"kind\":\"object\",\"type\":\"Section\",\"relationName\":\"SectionToTimetableEntry\"},{\"name\":\"batch\",\"kind\":\"object\",\"type\":\"SectionBatch\",\"relationName\":\"SectionBatchToTimetableEntry\"},{\"name\":\"subject\",\"kind\":\"object\",\"type\":\"Subject\",\"relationName\":\"SubjectToTimetableEntry\"},{\"name\":\"faculty\",\"kind\":\"object\",\"type\":\"FacultyProfile\",\"relationName\":\"FacultyProfileToTimetableEntry\"},{\"name\":\"room\",\"kind\":\"object\",\"type\":\"Room\",\"relationName\":\"RoomToTimetableEntry\"}],\"dbName\":\"timetable_entries\"},\"GenerationConflict\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"generationId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"kind\",\"kind\":\"enum\",\"type\":\"ConflictKind\"},{\"name\":\"code\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"message\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"requirementId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"sectionId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"facultyProfileId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"roomId\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"day\",\"kind\":\"enum\",\"type\":\"DayOfWeek\"},{\"name\":\"periodIndex\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"details\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"generation\",\"kind\":\"object\",\"type\":\"TimetableGeneration\",\"relationName\":\"GenerationConflictToTimetableGeneration\"}],\"dbName\":\"generation_conflicts\"}},\"enums\":{},\"types\":{}}")
defineDmmfProperty(exports.Prisma, config.runtimeDataModel)
config.engineWasm = {
  getRuntime: () => require('./query_engine_bg.js'),
  getQueryEngineWasmModule: async () => {
    const loader = (await import('#wasm-engine-loader')).default
    const engine = (await loader).default
    return engine 
  }
}

config.injectableEdgeEnv = () => ({
  parsed: {
    DATABASE_URL: typeof globalThis !== 'undefined' && globalThis['DATABASE_URL'] || typeof process !== 'undefined' && process.env && process.env.DATABASE_URL || undefined
  }
})

if (typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined) {
  Debug.enable(typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined)
}

const PrismaClient = getPrismaClient(config)
exports.PrismaClient = PrismaClient
Object.assign(exports, Prisma)

