/**
 * Schedule analytics computed from persisted timetable entries (no hardcoded figures).
 * Scope: one generation, or - by default - every PUBLISHED generation of the semester,
 * falling back to the newest completed draft when nothing is published yet.
 */
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { loadGrid } from "./scheduleInput";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export async function computeScheduleAnalytics(opts: { semesterId: number; generationId?: number; departmentId?: number }) {
  const { semesterId } = opts;
  const grid = await loadGrid(semesterId);
  const teaching = grid.periods.map((p, position) => ({ p, position })).filter((x) => !x.p.isBreak);
  const slotsPerWeek = grid.days.length * teaching.length;

  let gens;
  if (opts.generationId) {
    gens = await prisma.timetableGeneration.findMany({ where: { id: opts.generationId, semesterId } });
    if (!gens.length) throw new HttpError(404, "Generation not found in this semester");
  } else {
    gens = await prisma.timetableGeneration.findMany({ where: { semesterId, publishStatus: "PUBLISHED" } });
    if (!gens.length) gens = await prisma.timetableGeneration.findMany({ where: { semesterId, status: "COMPLETED", publishStatus: "DRAFT" }, orderBy: { version: "desc" }, take: 1 });
  }
  const genIds = gens.map((g) => g.id);
  const sectionIds = [...new Set(gens.flatMap((g) => g.sectionIds))];

  const [entries, rooms, profiles, sections, reqs, conflicts, facAvail, roomAvail] = await Promise.all([
    prisma.timetableEntry.findMany({ where: { generationId: { in: genIds } } }),
    prisma.room.findMany({ where: { isActive: true, department: { institutionId: grid.institutionId, ...(opts.departmentId ? { id: opts.departmentId } : {}) } }, include: { department: { select: { code: true } } } }),
    prisma.facultyProfile.findMany({ where: { user: { isDeleted: false, department: { institutionId: grid.institutionId, ...(opts.departmentId ? { id: opts.departmentId } : {}) } } }, include: { user: { select: { name: true, department: { select: { code: true } } } } } }),
    prisma.section.findMany({ where: { id: { in: sectionIds } }, include: { program: { select: { code: true, department: { select: { id: true, code: true, name: true } } } } } }),
    prisma.subjectRequirement.findMany({ where: { sectionId: { in: sectionIds } }, include: { subject: { select: { code: true, name: true } }, batch: { select: { name: true } } } }),
    prisma.generationConflict.findMany({ where: { generationId: { in: genIds }, kind: "UNASSIGNED" } }),
    prisma.facultyAvailability.findMany({ where: { semesterId, kind: "UNAVAILABLE" } }),
    prisma.roomAvailability.findMany({ where: { semesterId } }),
  ]);

  const periodCount = (e: { length: number }) => e.length;
  const roomUsed = new Map<number, number>();
  const facUsed = new Map<number, number>();
  const facDays = new Map<number, Set<string>>();
  const heat = new Map<string, number>();
  const perReq = new Map<number, number>();
  for (const e of entries) {
    roomUsed.set(e.roomId, (roomUsed.get(e.roomId) ?? 0) + periodCount(e));
    facUsed.set(e.facultyProfileId, (facUsed.get(e.facultyProfileId) ?? 0) + periodCount(e));
    (facDays.get(e.facultyProfileId) ?? facDays.set(e.facultyProfileId, new Set()).get(e.facultyProfileId)!).add(e.day);
    for (let k = 0; k < e.length; k++) heat.set(`${e.day}|${e.startPeriod + k}`, (heat.get(`${e.day}|${e.startPeriod + k}`) ?? 0) + 1);
    if (e.requirementId) perReq.set(e.requirementId, (perReq.get(e.requirementId) ?? 0) + 1);
  }
  const roomBlocked = new Map<number, number>();
  for (const a of roomAvail) roomBlocked.set(a.roomId, (roomBlocked.get(a.roomId) ?? 0) + 1);
  const facBlocked = new Map<number, number>();
  for (const a of facAvail) facBlocked.set(a.facultyProfileId, (facBlocked.get(a.facultyProfileId) ?? 0) + 1);

  const roomRows = rooms.map((r) => {
    const capacity = Math.max(0, slotsPerWeek - (roomBlocked.get(r.id) ?? 0));
    const used = roomUsed.get(r.id) ?? 0;
    return { roomId: r.id, roomNumber: r.roomNumber, type: r.type, department: r.department.code, usedPeriods: used, availablePeriods: capacity, utilization: pct(used, capacity) };
  });
  const facultyRows = profiles.map((f) => {
    const used = facUsed.get(f.id) ?? 0;
    return {
      facultyProfileId: f.id, name: f.user.name, department: f.user.department.code, periods: used, maxPeriodsPerWeek: f.maxPeriodsPerWeek,
      loadPercent: pct(used, f.maxPeriodsPerWeek), teachingDays: facDays.get(f.id)?.size ?? 0, overloaded: used > f.maxPeriodsPerWeek,
    };
  });

  const secRows = sections.map((s) => {
    const mine = reqs.filter((r) => r.sectionId === s.id);
    const required = mine.reduce((n, r) => n + r.sessionsPerWeek, 0);
    const scheduled = mine.reduce((n, r) => n + Math.min(r.sessionsPerWeek, perReq.get(r.id) ?? 0), 0);
    return {
      sectionId: s.id, name: `${s.program.code}-${s.yearOfStudy}${s.name}`, department: s.program.department.code,
      requiredSessions: required, scheduledSessions: scheduled, completion: pct(scheduled, required),
    };
  });

  const deptMap = new Map<string, { department: string; sections: number; required: number; scheduled: number }>();
  for (const s of sections) {
    const row = secRows.find((r) => r.sectionId === s.id)!;
    const d = deptMap.get(s.program.department.code) ?? { department: s.program.department.code, sections: 0, required: 0, scheduled: 0 };
    d.sections++; d.required += row.requiredSessions; d.scheduled += row.scheduledSessions;
    deptMap.set(s.program.department.code, d);
  }

  const unassigned = reqs
    .map((r) => ({ r, missing: r.sessionsPerWeek - (perReq.get(r.id) ?? 0) }))
    .filter((x) => x.missing > 0)
    .map(({ r, missing }) => ({ requirementId: r.id, sectionId: r.sectionId, subject: `${r.subject.code} ${r.subject.name}`, batch: r.batch?.name ?? null, missingSessions: missing }));

  const heatmap = grid.days.flatMap((d) => teaching.map(({ p, position }) => ({ day: d, period: p.label, position, classes: heat.get(`${d}|${position}`) ?? 0 })));
  const totalRoomCap = roomRows.reduce((n, r) => n + r.availablePeriods, 0);
  const usedRoom = roomRows.reduce((n, r) => n + r.usedPeriods, 0);
  const totalFacCap = facultyRows.reduce((n, f) => n + f.maxPeriodsPerWeek, 0);
  const usedFac = facultyRows.reduce((n, f) => n + f.periods, 0);
  const required = secRows.reduce((n, s) => n + s.requiredSessions, 0);
  const scheduled = secRows.reduce((n, s) => n + s.scheduledSessions, 0);

  return {
    scope: { semesterId, generationIds: genIds, published: gens.every((g) => g.publishStatus === "PUBLISHED"), slotsPerWeek },
    summary: {
      sections: secRows.length, requiredSessions: required, scheduledSessions: scheduled, completion: pct(scheduled, required),
      unassignedSessions: unassigned.reduce((n, u) => n + u.missingSessions, 0), unassignedConflictRows: conflicts.length,
      roomUtilization: pct(usedRoom, totalRoomCap), facultyUtilization: pct(usedFac, totalFacCap),
      idleRooms: roomRows.filter((r) => r.usedPeriods === 0).length, totalRooms: roomRows.length,
      overloadedFaculty: facultyRows.filter((f) => f.overloaded).length, totalFaculty: facultyRows.length,
      unusedRoomPeriods: Math.max(0, totalRoomCap - usedRoom),
    },
    rooms: roomRows.sort((a, b) => b.utilization - a.utilization),
    faculty: facultyRows.sort((a, b) => b.loadPercent - a.loadPercent),
    departments: [...deptMap.values()].map((d) => ({ ...d, completion: pct(d.scheduled, d.required) })),
    sections: secRows,
    unassigned,
    heatmap,
  };
}
