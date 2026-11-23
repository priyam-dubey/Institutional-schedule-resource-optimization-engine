
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


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

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

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
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
