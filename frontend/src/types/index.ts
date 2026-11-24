export type Role = 'ADMIN' | 'DEAN' | 'HOD' | 'COORDINATOR' | 'PROFESSOR';
export type RoomType = 'CLASSROOM' | 'LAB' | 'OTHER';
export type CourseType = 'LECTURE' | 'LAB' | 'TUTORIAL';
export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';
export type Period = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VII' | 'VIII' | 'IX';
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED' | 'AWAITING_REVIEW' | 'CANCELLED';

export interface Department {
  id: number; name: string; code: string; createdAt: string; updatedAt: string;
  _count?: { rooms: number; users: number; branches: number };
}
export interface Branch {
  id: number; name: string; code: string; departmentId: number;
  department?: { code: string };
}
export interface Room {
  id: number; roomNumber: string; departmentId: number; capacity: number | null;
  type: RoomType; department?: { code: string; name: string };
  occupiedSlots?: number; availableSlots?: number; utilization?: number; capacityMissing?: boolean;
}
export interface Course {
  id: number; code: string; name: string; credits: number; type: CourseType;
  branchId: number; semester: number; branch?: { code: string };
  scheduled?: number; required?: number; underRunning?: boolean;
}
export interface User {
  id: number; name: string; email: string; role: Role; departmentId: number;
  isDeleted: boolean; deletedAt: string | null; department?: { code: string };
}
export interface TimetableSlot {
  id: number; courseId: number; roomId: number; facultyId: number | null;
  dayOfWeek: DayOfWeek; period: Period; semester: number; branch: string;
  course?: { code: string; name: string; type: CourseType; credits: number };
  room?: { roomNumber: string; type: RoomType };
  faculty?: { name: string; email: string } | null;
}
export interface IngestionJob {
  id: string; type: string; status: JobStatus; filename: string | null;
  totalRows: number | null; createdRows: number; matchedRows: number; failedRows: number;
  errorLog: { reason: string; context?: string; row?: number }[] | null;
  createdAt: string; completedAt: string | null;
}
export interface RoomStat {
  roomId: number; roomNumber: string; department: string; type: RoomType;
  capacity: number | null; occupied: number; available: number; utilization: number;
}
export interface DayUtilization {
  day: DayOfWeek; occupied: number; available: number; utilization: number;
}
export interface UnderRunningCourse {
  courseId: number; code: string; name: string; credits: number;
  scheduled: number; required: number; deficit: number;
}
export interface DeptUtilization {
  deptId: number; deptCode: string; deptName: string;
  rooms: number; occupied: number; available: number; utilization: number;
}
export interface AnalyticsData {
  summary: {
    totalRooms: number; totalFaculty: number; totalCourses: number;
    totalDepartments: number; totalAvailableSlots: number; occupiedSlots: number;
    avgUtilization: number; avgEmptyRoomHoursPerDay: number;
  };
  roomStats: RoomStat[];
  dayUtilization: DayUtilization[];
  periodEmptyProbability: Record<string, number>;
  underRunningCourses: UnderRunningCourse[];
  deptUtilization: DeptUtilization[];
  computedAt: string;
}
export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}
