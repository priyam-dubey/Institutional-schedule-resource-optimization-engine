/** Viewing and manual editing of a stored timetable generation, with conflict re-detection. */
import { z } from "zod";
import type { DayOfWeek } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { publishEvent } from "../lib/events";
import { DAY_ORDER, loadGrid, type Db } from "./scheduleInput";
import { refreshConflicts, validateGeneration, type ValidationReport } from "./generationService";

const db = () => prisma as unknown as Db;

export const EditSchema = z
  .object({
    day: z.enum(DAY_ORDER as [DayOfWeek, ...DayOfWeek[]]).optional(),
    startPeriod: z.number().int().min(0).optional(),
    facultyProfileId: z.number().int().positive().optional(),
    roomId: z.number().int().positive().optional(),
    /** Keep the edit even if it creates hard conflicts (draft only; publishing stays blocked). */
    allowConflicts: z.boolean().optional(),
  })
  .strict();

export const AddEntrySchema = z.object({
  requirementId: z.number().int().positive(),
  sessionIndex: z.number().int().min(0),
  day: z.enum(DAY_ORDER as [DayOfWeek, ...DayOfWeek[]]),
  startPeriod: z.number().int().min(0),
  facultyProfileId: z.number().int().positive(),
  roomId: z.number().int().positive(),
  allowConflicts: z.boolean().optional(),
});

export interface EntryFilters {
  sectionId?: number;
  batchId?: number;
  facultyProfileId?: number;
  roomId?: number;
  day?: DayOfWeek;
}

export async function getTimetable(generationId: number, f: EntryFilters = {}) {
  const gen = await prisma.timetableGeneration.findUnique({ where: { id: generationId } });
  if (!gen) throw new HttpError(404, "Generation not found");
  const grid = await loadGrid(gen.semesterId);
  const entries = await prisma.timetableEntry.findMany({
    where: {
      generationId,
      ...(f.sectionId ? { sectionId: f.sectionId } : {}),
      ...(f.batchId ? { batchId: f.batchId } : {}),
      ...(f.facultyProfileId ? { facultyProfileId: f.facultyProfileId } : {}),
      ...(f.roomId ? { roomId: f.roomId } : {}),
      ...(f.day ? { day: f.day } : {}),
    },
    orderBy: [{ day: "asc" }, { startPeriod: "asc" }, { id: "asc" }],
    include: {
      subject: { select: { code: true, name: true, type: true } },
      section: { select: { name: true, yearOfStudy: true, program: { select: { code: true } } } },
      batch: { select: { name: true } },
      faculty: { select: { id: true, user: { select: { name: true } } } },
      room: { select: { roomNumber: true, type: true, building: true } },
    },
  });
  return {
    generation: gen,
    days: grid.days,
    periods: grid.periods.map((p, position) => ({ position, index: p.index, label: p.label, startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak })),
    entries: entries.map((e) => ({
      id: e.id, requirementId: e.requirementId, sessionIndex: e.sessionIndex,
      day: e.day, startPeriod: e.startPeriod, length: e.length,
      sectionId: e.sectionId, section: `${e.section.program.code}-${e.section.yearOfStudy}${e.section.name}`,
      batchId: e.batchId, batch: e.batch?.name ?? null,
      subjectId: e.subjectId, subjectCode: e.subject.code, subjectName: e.subject.name, subjectType: e.subject.type,
      facultyProfileId: e.facultyProfileId, facultyName: e.faculty.user.name,
      roomId: e.roomId, roomNumber: e.room.roomNumber, roomType: e.room.type,
    })),
  };
}

async function assertEditable(tx: Db, generationId: number) {
  const gen = await tx.timetableGeneration.findUnique({ where: { id: generationId } });
  if (!gen) throw new HttpError(404, "Generation not found");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${gen.semesterId}::bigint)`;
  const cur = await tx.timetableGeneration.findUniqueOrThrow({ where: { id: generationId } });
  if (cur.publishStatus === "PUBLISHED") throw new HttpError(409, "Unpublish the timetable (or clone it into a new version) before editing", undefined, "PUBLISHED");
  if (cur.publishStatus === "ARCHIVED") throw new HttpError(409, "Archived timetables are read-only");
  if (cur.status !== "COMPLETED") throw new HttpError(409, `Cannot edit a ${cur.status} generation`);
  return cur;
}

async function finishEdit(tx: Db, generationId: number, allowConflicts?: boolean): Promise<ValidationReport> {
  const report = await validateGeneration(generationId, tx);
  if (!report.valid && !allowConflicts) {
    // throwing rolls the whole transaction back: the edit is not applied
    throw new HttpError(409, `The change would create ${report.totalViolations} conflict(s)`, report, "CONFLICT");
  }
  await refreshConflicts(generationId, tx);
  return report;
}

export async function editEntry(generationId: number, entryId: number, patch: z.infer<typeof EditSchema>) {
  const { allowConflicts, ...data } = patch;
  if (!Object.keys(data).length) throw new HttpError(400, "Nothing to change");
  const out = await prisma.$transaction(
    async (tx) => {
      const gen = await assertEditable(tx as unknown as Db, generationId);
      const entry = await tx.timetableEntry.findFirst({ where: { id: entryId, generationId } });
      if (!entry) throw new HttpError(404, "Entry not found");
      if (data.facultyProfileId) {
        const f = await tx.facultyProfile.findUnique({ where: { id: data.facultyProfileId } });
        if (!f) throw new HttpError(404, "Faculty not found");
      }
      if (data.roomId) {
        const r = await tx.room.findUnique({ where: { id: data.roomId } });
        if (!r) throw new HttpError(404, "Room not found");
      }
      const updated = await tx.timetableEntry.update({ where: { id: entryId }, data });
      const report = await finishEdit(tx as unknown as Db, generationId, allowConflicts);
      return { entry: updated, report, semesterId: gen.semesterId };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  await publishEvent({ type: "timetable.edited", generationId, semesterId: out.semesterId });
  return out;
}

export async function addEntry(generationId: number, body: z.infer<typeof AddEntrySchema>) {
  const { allowConflicts, ...b } = body;
  const out = await prisma.$transaction(
    async (tx) => {
      const gen = await assertEditable(tx as unknown as Db, generationId);
      const req = await tx.subjectRequirement.findUnique({ where: { id: b.requirementId }, include: { section: true } });
      if (!req || !gen.sectionIds.includes(req.sectionId)) throw new HttpError(404, "Requirement not part of this generation");
      if (b.sessionIndex >= req.sessionsPerWeek) throw new HttpError(422, `sessionIndex must be < ${req.sessionsPerWeek}`);
      const dup = await tx.timetableEntry.findFirst({ where: { generationId, requirementId: b.requirementId, sessionIndex: b.sessionIndex } });
      if (dup) throw new HttpError(409, "That session is already scheduled");
      const entry = await tx.timetableEntry.create({
        data: {
          generationId, requirementId: req.id, sessionIndex: b.sessionIndex, sectionId: req.sectionId, batchId: req.batchId,
          subjectId: req.subjectId, facultyProfileId: b.facultyProfileId, roomId: b.roomId, day: b.day, startPeriod: b.startPeriod, length: req.blockLength,
        },
      });
      const report = await finishEdit(tx as unknown as Db, generationId, allowConflicts);
      return { entry, report, semesterId: gen.semesterId };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  await publishEvent({ type: "timetable.edited", generationId, semesterId: out.semesterId });
  return out;
}

export async function deleteEntry(generationId: number, entryId: number) {
  const out = await prisma.$transaction(
    async (tx) => {
      const gen = await assertEditable(tx as unknown as Db, generationId);
      const n = await tx.timetableEntry.deleteMany({ where: { id: entryId, generationId } });
      if (!n.count) throw new HttpError(404, "Entry not found");
      await refreshConflicts(generationId, tx as unknown as Db);
      return { semesterId: gen.semesterId };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  await publishEvent({ type: "timetable.edited", generationId, semesterId: out.semesterId });
}

/** New draft version copied from an existing generation (e.g. to edit a published timetable safely). */
export async function cloneGeneration(generationId: number, userId: number) {
  return prisma.$transaction(
    async (tx) => {
      const src = await tx.timetableGeneration.findUnique({ where: { id: generationId } });
      if (!src) throw new HttpError(404, "Generation not found");
      if (src.status !== "COMPLETED") throw new HttpError(409, "Only completed generations can be cloned");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${src.semesterId}::bigint)`;
      const max = await tx.timetableGeneration.aggregate({ where: { semesterId: src.semesterId }, _max: { version: true } });
      const copy = await tx.timetableGeneration.create({
        data: {
          semesterId: src.semesterId, version: (max._max.version ?? 0) + 1, name: `${src.name ?? `v${src.version}`} (copy)`,
          source: src.source, status: "COMPLETED", solveStatus: src.solveStatus, sectionIds: src.sectionIds,
          config: src.config as object, progress: 100, progressMessage: `Cloned from v${src.version}`,
          score: src.score, totalSessions: src.totalSessions, assignedSessions: src.assignedSessions,
          createdById: userId, completedAt: new Date(),
        },
      });
      const entries = await tx.timetableEntry.findMany({ where: { generationId } });
      if (entries.length) {
        await tx.timetableEntry.createMany({
          data: entries.map(({ id: _id, createdAt: _c, updatedAt: _u, generationId: _g, ...rest }) => ({ ...rest, generationId: copy.id })),
        });
      }
      await refreshConflicts(copy.id, tx as unknown as Db);
      return copy;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}
