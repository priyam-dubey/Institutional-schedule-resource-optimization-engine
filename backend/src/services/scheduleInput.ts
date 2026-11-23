/**
 * Maps persisted academic data to the pure scheduler's input, and persisted
 * timetable entries back to scheduler assignments.
 *
 * Two modes:
 *  - "generate": the sections being (re)generated are solved; entries of OTHER published
 *    generations in the same semester become faculty/room unavailability and faculty load,
 *    so a new timetable can never collide with a live one.
 *  - "validate": the sections of this generation plus every non-overlapping published
 *    generation are loaded together with all their stored entries, so the independent
 *    validator checks the union exactly as students and staff would experience it.
 */
import type { DayOfWeek, Prisma, RoomType as DbRoomType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { Assignment, SchedulerConfig, SchedulerInput, SchedRequirement, SlotRef } from "../scheduler/types";

export type Db = Prisma.TransactionClient;
const base = (): Db => prisma as unknown as Db;

export const DAY_ORDER: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export class ScheduleSetupError extends Error {
  status = 422;
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

export interface ReqMeta {
  requirementId: number | null; // null for ad-hoc (imported / manually added) entries
  entryId?: number;
  sectionId: number;
  batchId: number | null;
  subjectId: number;
  label: string;
}

export interface BuiltInput {
  input: SchedulerInput;
  days: DayOfWeek[];
  /** SemesterPeriod.index -> position in input.periods */
  periodPos: Map<number, number>;
  positions: number[]; // position -> SemesterPeriod.index
  reqMeta: Map<string, ReqMeta>;
  warnings: string[];
  institutionId: number;
  semesterId: number;
  /** Sections whose requirements are being solved/validated as the "subject" of this run. */
  primarySectionIds: number[];
  /** Assignments reconstructed from stored entries (validate mode only). */
  assignments: Assignment[];
  entryByKey: Map<string, number>; // `${reqId}#${sessionIndex}` -> entry id
}

const fid = (id: number) => `f${id}`;
const rid = (id: number) => `m${id}`;
const qid = (id: number) => `r${id}`;
const sectionGroup = (id: number) => `S${id}`;
const batchGroup = (id: number) => `B${id}`;

const lc = (s: string) => s.trim().toLowerCase();

export async function loadGrid(semesterId: number, db: Db = base()) {
  const semester = await db.semester.findUnique({
    where: { id: semesterId },
    include: { periods: { orderBy: { index: "asc" } }, academicYear: true },
  });
  if (!semester) throw new ScheduleSetupError(`Semester ${semesterId} not found`);
  const days = DAY_ORDER.filter((d) => semester.workingDays.includes(d));
  if (days.length === 0) throw new ScheduleSetupError("The semester has no working days configured");
  if (!semester.periods.some((p) => !p.isBreak)) {
    throw new ScheduleSetupError("The semester has no teaching periods configured");
  }
  return { semester, days, periods: semester.periods, institutionId: semester.academicYear.institutionId };
}

export async function buildInput(opts: {
  semesterId: number;
  sectionIds: number[];
  mode: "generate" | "validate";
  generationId?: number;
  config?: SchedulerConfig;
  db?: Db;
}): Promise<BuiltInput> {
  const { semesterId, mode } = opts;
  const db = opts.db ?? base();
  const grid = await loadGrid(semesterId, db);
  const { days, periods, institutionId } = grid;
  const P = periods.length;
  const periodPos = new Map(periods.map((p, i) => [p.index, i]));
  const warnings: string[] = [];

  // Other published generations in this semester
  const others = await db.timetableGeneration.findMany({
    where: {
      semesterId,
      publishStatus: "PUBLISHED",
      ...(opts.generationId ? { id: { not: opts.generationId } } : {}),
    },
    select: { id: true, sectionIds: true },
  });
  const mine = new Set(opts.sectionIds);
  const disjoint = others.filter((g) => !g.sectionIds.some((s) => mine.has(s)));

  let scopeSections = [...opts.sectionIds];
  const entryGenerationIds: number[] = [];
  if (mode === "validate") {
    if (opts.generationId) entryGenerationIds.push(opts.generationId);
    for (const g of disjoint) {
      scopeSections.push(...g.sectionIds);
      entryGenerationIds.push(g.id);
    }
    scopeSections = [...new Set(scopeSections)];
  }

  const sections = await db.section.findMany({
    where: { id: { in: scopeSections }, semesterId },
    include: {
      batches: { orderBy: { id: "asc" } },
      program: { select: { code: true } },
      requirements: { include: { subject: true } },
    },
  });
  const foundIds = new Set(sections.map((s) => s.id));
  const missing = scopeSections.filter((s) => !foundIds.has(s));
  if (missing.length && mode === "generate") {
    throw new ScheduleSetupError(`Sections not found in this semester: ${missing.join(", ")}`);
  }

  // Resources of the institution
  const [rooms, profiles, quals, avail, roomAvail] = await Promise.all([
    db.room.findMany({ where: { department: { institutionId } } }),
    db.facultyProfile.findMany({
      where: { user: { isDeleted: false, department: { institutionId } } },
      include: { user: { select: { name: true } } },
    }),
    db.facultySubject.findMany({ where: { faculty: { user: { department: { institutionId } } } } }),
    db.facultyAvailability.findMany({ where: { semesterId } }),
    db.roomAvailability.findMany({ where: { semesterId } }),
  ]);

  const toSlot = (day: DayOfWeek, periodIndex: number): SlotRef | null => {
    const d = days.indexOf(day);
    const p = periodPos.get(periodIndex);
    return d < 0 || p === undefined ? null : { day: d, period: p };
  };

  // Cells held by other published generations (generate mode)
  const busyFaculty = new Map<number, SlotRef[]>();
  const busyRoom = new Map<number, SlotRef[]>();
  const busyLoad = new Map<number, number>();
  if (mode === "generate" && others.length) {
    const otherEntries = await db.timetableEntry.findMany({
      where: { generationId: { in: others.map((g) => g.id) }, sectionId: { notIn: opts.sectionIds } },
    });
    for (const e of otherEntries) {
      const d = days.indexOf(e.day);
      if (d < 0) continue;
      for (let k = 0; k < e.length; k++) {
        const cell = { day: d, period: e.startPeriod + k };
        (busyFaculty.get(e.facultyProfileId) ?? busyFaculty.set(e.facultyProfileId, []).get(e.facultyProfileId)!).push(cell);
        (busyRoom.get(e.roomId) ?? busyRoom.set(e.roomId, []).get(e.roomId)!).push(cell);
      }
      busyLoad.set(e.facultyProfileId, (busyLoad.get(e.facultyProfileId) ?? 0) + e.length);
    }
  }

  // Rooms
  const allCells: SlotRef[] = [];
  for (let d = 0; d < days.length; d++) for (let p = 0; p < P; p++) allCells.push({ day: d, period: p });
  const schedRooms: SchedulerInput["rooms"] = [];
  for (const r of rooms) {
    const unavailable: SlotRef[] = [...(busyRoom.get(r.id) ?? [])];
    for (const a of roomAvail) if (a.roomId === r.id) { const s = toSlot(a.day, a.periodIndex); if (s) unavailable.push(s); }
    if (!r.isActive) {
      if (mode === "generate") continue;
      unavailable.push(...allCells);
    }
    if (r.capacity == null) {
      if (mode === "generate") {
        if (r.isActive) warnings.push(`Room ${r.roomNumber} has no capacity set and was excluded from scheduling`);
        continue;
      }
    }
    schedRooms.push({ id: rid(r.id), capacity: r.capacity ?? 0, type: r.type, unavailable });
  }
  const roomEquip = new Map(rooms.map((r) => [rid(r.id), new Set(r.equipment.map(lc))]));

  // Faculty
  const schedFaculty: SchedulerInput["faculty"] = profiles.map((f) => {
    const unavailable: SlotRef[] = [...(busyFaculty.get(f.id) ?? [])];
    const preferred: SlotRef[] = [];
    for (const a of avail) {
      if (a.facultyProfileId !== f.id) continue;
      const s = toSlot(a.day, a.periodIndex);
      if (!s) continue;
      (a.kind === "UNAVAILABLE" ? unavailable : preferred).push(s);
    }
    return {
      id: fid(f.id),
      maxPeriodsPerWeek: Math.max(0, f.maxPeriodsPerWeek - (busyLoad.get(f.id) ?? 0)),
      maxConsecutive: f.maxConsecutive,
      unavailable,
      preferred,
    };
  });
  const qualifiedBySubject = new Map<number, number[]>();
  for (const q of quals) (qualifiedBySubject.get(q.subjectId) ?? qualifiedBySubject.set(q.subjectId, []).get(q.subjectId)!).push(q.facultyProfileId);
  const profileIds = new Set(profiles.map((p) => p.id));

  // Requirements
  const requirements: SchedRequirement[] = [];
  const reqMeta = new Map<string, ReqMeta>();
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  for (const s of sections) {
    const batchIds = s.batches.map((b) => b.id);
    const wholeGroups = batchIds.length ? batchIds.map(batchGroup) : [sectionGroup(s.id)];
    for (const r of s.requirements) {
      if (r.sessionsPerWeek <= 0) continue;
      const batch = r.batchId ? s.batches.find((b) => b.id === r.batchId) : undefined;
      if (r.batchId && !batch) continue;
      const qualified = (qualifiedBySubject.get(r.subjectId) ?? []).filter((x) => profileIds.has(x));
      let facultyIds = new Set<number>(qualified);
      if (r.assignedFacultyId && profileIds.has(r.assignedFacultyId)) {
        if (mode === "generate") facultyIds = new Set([r.assignedFacultyId]);
        else facultyIds.add(r.assignedFacultyId);
      }
      const need = [...new Set([...r.subject.requiredEquipment, ...r.requiredEquipment].map(lc))].filter(Boolean);
      let allowedRoomIds: string[] | undefined;
      if (need.length) {
        allowedRoomIds = schedRooms.filter((m) => need.every((n) => roomEquip.get(m.id)?.has(n))).map((m) => m.id);
      }
      const label = `${r.subject.code} · ${s.program.code}-${s.yearOfStudy}${s.name}${batch ? ` ${batch.name}` : ""}`;
      const id = qid(r.id);
      requirements.push({
        id,
        subjectId: String(r.subjectId),
        label,
        studentGroups: batch ? [batchGroup(batch.id)] : wholeGroups,
        strength: batch ? batch.strength : s.strength,
        facultyIds: [...facultyIds].map(fid),
        sessionsPerWeek: r.sessionsPerWeek,
        blockLength: r.blockLength,
        roomTypes: [r.roomType as DbRoomType],
        ...(allowedRoomIds ? { allowedRoomIds } : {}),
      });
      reqMeta.set(id, { requirementId: r.id, sectionId: s.id, batchId: r.batchId, subjectId: r.subjectId, label });
    }
  }

  // Stored entries -> assignments (validate mode)
  const assignments: Assignment[] = [];
  const entryByKey = new Map<string, number>();
  if (mode === "validate" && entryGenerationIds.length) {
    const entries = await db.timetableEntry.findMany({
      where: { generationId: { in: entryGenerationIds } },
      include: { subject: { select: { code: true } } },
      orderBy: { id: "asc" },
    });
    for (const e of entries) {
      const d = days.indexOf(e.day);
      let reqId: string;
      let sessionIndex = e.sessionIndex;
      if (e.requirementId && reqMeta.has(qid(e.requirementId))) {
        reqId = qid(e.requirementId);
      } else {
        // ad-hoc entry (imported, or its requirement was deleted): validate it as a one-session requirement
        reqId = `e${e.id}`;
        sessionIndex = 0;
        const sec = sectionById.get(e.sectionId);
        const batch = e.batchId ? sec?.batches.find((b) => b.id === e.batchId) : undefined;
        const groups = batch ? [batchGroup(batch.id)] : sec?.batches.length ? sec.batches.map((b) => batchGroup(b.id)) : [sectionGroup(e.sectionId)];
        requirements.push({
          id: reqId,
          subjectId: String(e.subjectId),
          label: `${e.subject.code} (ad-hoc)`,
          studentGroups: groups,
          strength: 0,
          facultyIds: [fid(e.facultyProfileId)],
          sessionsPerWeek: 1,
          blockLength: e.length,
          roomTypes: ["CLASSROOM", "LAB", "OTHER"],
        });
        reqMeta.set(reqId, { requirementId: null, entryId: e.id, sectionId: e.sectionId, batchId: e.batchId, subjectId: e.subjectId, label: `${e.subject.code} (ad-hoc)` });
      }
      assignments.push({
        requirementId: reqId,
        sessionIndex,
        facultyId: fid(e.facultyProfileId),
        roomId: rid(e.roomId),
        day: d < 0 ? -1 : d,
        startPeriod: e.startPeriod,
        length: e.length,
      });
      entryByKey.set(`${reqId}#${sessionIndex}`, e.id);
    }
    // entries may reference faculty/rooms missing from the lists (deleted user) - the validator reports UNKNOWN_REFERENCE
  }

  return {
    input: {
      days: days.map(String),
      periods: periods.map((p) => ({ label: p.label, isBreak: p.isBreak })),
      rooms: schedRooms,
      faculty: schedFaculty,
      requirements,
      config: opts.config,
    },
    days,
    periodPos,
    positions: periods.map((p) => p.index),
    reqMeta,
    warnings,
    institutionId,
    semesterId,
    primarySectionIds: opts.sectionIds,
    assignments,
    entryByKey,
  };
}

export type { Prisma };
