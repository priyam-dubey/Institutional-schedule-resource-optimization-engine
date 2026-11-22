/**
 * Scheduler domain types.
 *
 * The engine is a pure module: it knows nothing about Prisma, Express or Redis.
 * The worker maps database rows into a SchedulerInput and maps the result back.
 * All ids are strings so any storage layer can be adapted.
 *
 * Time model: a week is `days.length` days x `periods.length` periods.
 * A period flagged `isBreak` can never hold a class and also splits runs, so a
 * multi-period block can never straddle a break.
 */

export type RoomType = "CLASSROOM" | "LAB" | "OTHER";

export interface PeriodDef {
  label: string;
  isBreak: boolean;
}

/** Zero-based indices into SchedulerInput.days / SchedulerInput.periods. */
export interface SlotRef {
  day: number;
  period: number;
}

export interface SchedRoom {
  id: string;
  capacity: number;
  type: RoomType;
  unavailable?: SlotRef[];
}

export interface SchedFaculty {
  id: string;
  /** Hard cap, measured in periods per week. */
  maxPeriodsPerWeek: number;
  /** Hard cap on back-to-back periods for this faculty member. */
  maxConsecutive: number;
  unavailable?: SlotRef[];
  /** Soft preference. Empty/undefined means "no preference". */
  preferred?: SlotRef[];
}

/**
 * One teaching requirement: "section X needs subject Y, N sessions a week,
 * each session being `blockLength` consecutive periods".
 */
export interface SchedRequirement {
  id: string;
  subjectId: string;
  label?: string;
  /**
   * Atomic student groups occupied by this requirement. A whole-section lecture
   * lists every batch group of the section; a lab for one batch lists only that
   * batch. Two requirements that share a group can never overlap in time.
   */
  studentGroups: string[];
  /** Head-count used for the room capacity check. */
  strength: number;
  /** Faculty qualified to teach this requirement (exactly one gets chosen). */
  facultyIds: string[];
  sessionsPerWeek: number;
  /** Consecutive periods per session (1 for a lecture, 2-3 for a lab). */
  blockLength: number;
  /** Room types this requirement may use. */
  roomTypes: RoomType[];
}

export interface SoftWeights {
  studentGap: number;
  facultyGap: number;
  subjectSameDay: number;
  streak: number;
  preferred: number;
  roomWaste: number;
  loadBalance: number;
}

export interface SchedulerConfig {
  /** Seed for tie-break jitter on restarts. Same seed + input => same output. */
  seed?: number;
  /** Wall-clock safety net. Reproducibility holds when the backtrack budget ends the search first. */
  timeLimitMs?: number;
  /** Backtrack budget per attempt (the primary, deterministic stopping rule). */
  maxBacktracks?: number;
  /** Extra randomised attempts after the first deterministic one. */
  restarts?: number;
  /** Max (position, faculty, room) tuples tried per variable. */
  branchLimit?: number;
  localSearchPasses?: number;
  /** Soft cap for consecutive periods per student group before the streak penalty applies. */
  maxStudentStreak?: number;
  weights?: Partial<SoftWeights>;
}

export interface SchedulerInput {
  days: string[];
  periods: PeriodDef[];
  rooms: SchedRoom[];
  faculty: SchedFaculty[];
  requirements: SchedRequirement[];
  config?: SchedulerConfig;
}

export interface Assignment {
  requirementId: string;
  /** 0 .. sessionsPerWeek-1 */
  sessionIndex: number;
  facultyId: string;
  roomId: string;
  day: number;
  startPeriod: number;
  length: number;
}

export type ViolationType =
  | "UNKNOWN_REFERENCE"
  | "DUPLICATE_SESSION"
  | "TOO_MANY_SESSIONS"
  | "FACULTY_NOT_QUALIFIED"
  | "ROOM_TYPE_MISMATCH"
  | "ROOM_CAPACITY"
  | "BLOCK_OUT_OF_RANGE"
  | "BREAK_PERIOD_USED"
  | "FACULTY_UNAVAILABLE"
  | "ROOM_UNAVAILABLE"
  | "FACULTY_CONFLICT"
  | "ROOM_CONFLICT"
  | "GROUP_CONFLICT"
  | "FACULTY_MAX_PERIODS"
  | "FACULTY_MAX_CONSECUTIVE"
  | "SESSION_COUNT_UNMET";

export interface Violation {
  type: ViolationType;
  message: string;
  requirementId?: string;
  facultyId?: string;
  roomId?: string;
  day?: number;
  period?: number;
}

export interface UnassignedSession {
  requirementId: string;
  sessionIndex: number;
  reasons: string[];
}

export interface PenaltyBreakdown {
  studentGap: number;
  facultyGap: number;
  subjectSameDay: number;
  streak: number;
  preferred: number;
  roomWaste: number;
  loadBalance: number;
  total: number;
}

export interface InfeasibilityProof {
  kind: string;
  message: string;
}

/**
 * COMPLETE   - every session placed and the independent validator found 0 violations.
 * PARTIAL    - valid but incomplete; see `unassigned`.
 * INFEASIBLE - a counting argument proves a full timetable cannot exist (best partial still returned).
 * INVALID    - defensive: the validator found hard violations in the solver's output (a bug).
 */
export type SchedulerStatus = "COMPLETE" | "PARTIAL" | "INFEASIBLE" | "INVALID";

export interface SchedulerResult {
  status: SchedulerStatus;
  assignments: Assignment[];
  totalSessions: number;
  assignedSessions: number;
  unassigned: UnassignedSession[];
  hardViolations: Violation[];
  infeasibilityProofs: InfeasibilityProof[];
  penalties: PenaltyBreakdown;
  /** 0-100. 100 = no soft penalty. See engine.ts `scoreFromPenalty`. */
  score: number;
  durationMs: number;
  stats: {
    nodes: number;
    backtracks: number;
    attempts: number;
    localSearchImprovements: number;
    stoppedBy: "complete" | "backtrack-budget" | "time-limit";
  };
}

export const DEFAULT_WEIGHTS: SoftWeights = {
  studentGap: 3,
  facultyGap: 2,
  subjectSameDay: 4,
  streak: 2,
  preferred: 1.5,
  roomWaste: 2,
  loadBalance: 0.5,
};
