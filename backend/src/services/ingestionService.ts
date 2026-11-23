/** Review workflow for PDF-extracted timetables: suggest -> edit -> validate -> commit. */
import { z } from "zod";
import type { DayOfWeek, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { publishEvent } from "../lib/events";
import { validateAssignments } from "../scheduler/validator";
import type { Assignment, SchedRequirement } from "../scheduler/types";
import { DAY_ORDER, buildInput, type Db } from "./scheduleInput";
import { refreshConflicts } from "./generationService";
import type { ExtractedRow } from "./pdfExtract";

export interface StagedRow extends ExtractedRow {
  matched?: boolean;
}

export const RowSchema = z.object({
  id: z.string().min(1).max(40),
  day: z.enum(DAY_ORDER as [DayOfWeek, ...DayOfWeek[]]),
  periodLabel: z.string().min(1).max(30),
  raw: z.string().max(500).default(""),
  subjectCode: z.string().min(1).max(40),
  roomNumber: z.string().max(50).nullable(),
  batchName: z.string().max(20).nullable(),
  facultyProfileId: z.number().int().positive().nullable(),
  length: z.number().int().min(1).max(4),
  matched: z.boolean().optional(),
});
export const PayloadSchema = z.object({
  meta: z.record(z.string().optional()).default({}),
  rows: z.array(RowSchema).max(1000),
});

function lev(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const norm = (s: string) => s.toUpperCase().replace(/[\s\-_.]/g, "");

/** Replace printed abbreviations with real subject codes where unambiguous; pre-fill a sole qualified teacher. */
export async function suggestSubjects(rows: ExtractedRow[], departmentCode?: string): Promise<StagedRow[]> {
  const subjects = await prisma.subject.findMany({ include: { department: { select: { code: true } }, qualified: { select: { facultyProfileId: true } } } });
  const pool = departmentCode ? subjects.filter((s) => s.department.code === departmentCode) : subjects;
  const search = pool.length ? pool : subjects;
  return rows.map((r) => {
    const key = norm(r.subjectCode);
    let hit = search.find((s) => norm(s.code) === key);
    if (!hit) {
      const partial = search.filter((s) => norm(s.code).includes(key) || key.includes(norm(s.code)));
      if (partial.length === 1) hit = partial[0];
    }
    if (!hit) {
      const near = search.map((s) => ({ s, d: lev(key, norm(s.code)) })).sort((a, b) => a.d - b.d);
      if (near[0] && near[0].d <= 2 && (!near[1] || near[1].d > near[0].d)) hit = near[0].s;
    }
    if (!hit) return { ...r, matched: false };
    return {
      ...r,
      subjectCode: hit.code,
      matched: true,
      facultyProfileId: r.facultyProfileId ?? (hit.qualified.length === 1 ? hit.qualified[0].facultyProfileId : null),
    };
  });
}

export interface RowIssue {
  rowId: string | null;
  severity: "error" | "warning";
  code: string;
  message: string;
}

export async function loadReviewJob(jobId: string) {
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job || job.type !== "pdf-parse") throw new HttpError(404, "Ingestion job not found");
  return job;
}

export async function savePayload(jobId: string, body: unknown) {
  const job = await loadReviewJob(jobId);
  if (job.status !== "AWAITING_REVIEW") throw new HttpError(409, `Job is ${job.status}; only jobs awaiting review can be edited`);
  const parsed = PayloadSchema.parse(body);
  const ids = new Set<string>();
  for (const r of parsed.rows) {
    if (ids.has(r.id)) throw new HttpError(422, `Duplicate row id ${r.id}`);
    ids.add(r.id);
  }
  const prev = (job.payload ?? {}) as Record<string, unknown>;
  return prisma.ingestionJob.update({
    where: { id: jobId },
    data: { payload: { ...prev, meta: parsed.meta, rows: parsed.rows } as never, totalRows: parsed.rows.length },
  });
}

interface Resolved {
  assignments: Assignment[];
  requirements: SchedRequirement[];
  issues: RowIssue[];
  entries: Prisma.TimetableEntryCreateManyInput[];
  rowOfReq: Map<string, string>;
}

/** Resolves rows against real records and validates the hard constraints, without persisting anything. */
export async function validateStaged(jobId: string, target: { semesterId: number; sectionId: number }, client: Db = prisma as unknown as Db) {
  const job = await loadReviewJob(jobId);
  if (job.status !== "AWAITING_REVIEW") throw new HttpError(409, `Job is ${job.status}`);
  const payload = PayloadSchema.parse(job.payload ?? { rows: [] });
  const section = await client.section.findUnique({ where: { id: target.sectionId }, include: { batches: true, requirements: true } });
  if (!section || section.semesterId !== target.semesterId) throw new HttpError(404, "Section not found in that semester");

  const built = await buildInput({ semesterId: target.semesterId, sectionIds: [target.sectionId], mode: "generate", db: client });
  const grid = { days: built.days, labels: built.input.periods.map((p) => p.label.toUpperCase()), isBreak: built.input.periods.map((p) => p.isBreak) };
  const [subjects, rooms] = await Promise.all([
    client.subject.findMany({ select: { id: true, code: true } }),
    client.room.findMany({ where: { department: { institutionId: built.institutionId } }, select: { id: true, roomNumber: true } }),
  ]);
  const subjByCode = new Map(subjects.map((s) => [norm(s.code), s.id]));
  const roomByNo = new Map(rooms.map((r) => [norm(r.roomNumber), r.id]));
  const facIds = new Set(built.input.faculty.map((f) => f.id));

  const issues: RowIssue[] = [];
  const err = (rowId: string, code: string, message: string) => issues.push({ rowId, severity: "error", code, message });
  const res: Resolved = { assignments: [], requirements: [], issues, entries: [], rowOfReq: new Map() };
  const usedReq = new Map<number, number>(); // requirementId -> next session index
  if (!payload.rows.length) issues.push({ rowId: null, severity: "error", code: "NO_ROWS", message: "There are no rows to import" });

  for (const r of payload.rows) {
    const subjectId = subjByCode.get(norm(r.subjectCode));
    const roomId = r.roomNumber ? roomByNo.get(norm(r.roomNumber)) : undefined;
    const pos = grid.labels.indexOf(r.periodLabel.toUpperCase());
    const dayIdx = grid.days.indexOf(r.day);
    let ok = true;
    if (!subjectId) { err(r.id, "UNKNOWN_SUBJECT", `Subject "${r.subjectCode}" does not exist`); ok = false; }
    if (!r.roomNumber) { err(r.id, "ROOM_MISSING", "Choose a room"); ok = false; }
    else if (!roomId) { err(r.id, "UNKNOWN_ROOM", `Room "${r.roomNumber}" does not exist (or has no capacity set / is inactive)`); ok = false; }
    if (!r.facultyProfileId) { err(r.id, "FACULTY_MISSING", "Choose the faculty member"); ok = false; }
    else if (!facIds.has(`f${r.facultyProfileId}`)) { err(r.id, "UNKNOWN_FACULTY", `Faculty ${r.facultyProfileId} does not exist`); ok = false; }
    if (pos < 0) { err(r.id, "UNKNOWN_PERIOD", `Period "${r.periodLabel}" is not in this semester's period grid`); ok = false; }
    if (dayIdx < 0) { err(r.id, "NOT_WORKING_DAY", `${r.day} is not a working day of this semester`); ok = false; }
    const batch = r.batchName ? section.batches.find((b) => b.name.toUpperCase() === r.batchName!.toUpperCase()) : undefined;
    if (r.batchName && !batch) { err(r.id, "UNKNOWN_BATCH", `Section has no batch "${r.batchName}"`); ok = false; }
    if (!ok) continue;

    // link to a declared requirement when one matches (keeps completeness/analytics meaningful)
    const match = section.requirements.find((q) => q.subjectId === subjectId && (q.batchId ?? null) === (batch?.id ?? null));
    let requirementId: number | null = null;
    let sessionIndex = 0;
    if (match) {
      const used = usedReq.get(match.id) ?? 0;
      if (used < match.sessionsPerWeek) { requirementId = match.id; sessionIndex = used; usedReq.set(match.id, used + 1); }
    }
    const reqId = `p${r.id}`;
    const groups = batch ? [`B${batch.id}`] : section.batches.length ? section.batches.map((b) => `B${b.id}`) : [`S${section.id}`];
    res.requirements.push({
      id: reqId, subjectId: String(subjectId), label: `${r.subjectCode} ${r.day} ${r.periodLabel}`, studentGroups: groups,
      strength: batch ? batch.strength : section.strength, facultyIds: [`f${r.facultyProfileId}`], sessionsPerWeek: 1,
      blockLength: r.length, roomTypes: ["CLASSROOM", "LAB", "OTHER"],
    });
    res.rowOfReq.set(reqId, r.id);
    res.assignments.push({ requirementId: reqId, sessionIndex: 0, facultyId: `f${r.facultyProfileId}`, roomId: `m${roomId}`, day: dayIdx, startPeriod: pos, length: r.length });
    res.entries.push({
      generationId: 0, requirementId, sessionIndex, sectionId: section.id, batchId: batch?.id ?? null, subjectId: subjectId!,
      facultyProfileId: r.facultyProfileId!, roomId: roomId!, day: r.day as DayOfWeek, startPeriod: pos, length: r.length,
    });
  }

  const input = { ...built.input, requirements: res.requirements };
  const viol = validateAssignments(input, res.assignments);
  for (const v of viol) {
    issues.push({ rowId: v.requirementId ? res.rowOfReq.get(v.requirementId) ?? null : null, severity: "error", code: v.type, message: v.message.replace(/\bp?r\d+#0\b/g, "this class") });
  }
  for (const w of (job.payload as { warnings?: string[] } | null)?.warnings ?? []) issues.push({ rowId: null, severity: "warning", code: "EXTRACTION", message: w });
  return { ok: !issues.some((i) => i.severity === "error"), issues, resolved: res, built, section };
}

export async function commitStaged(jobId: string, target: { semesterId: number; sectionId: number; name?: string }, userId: number) {
  const out = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${target.semesterId}::bigint)`;
      const r = await validateStaged(jobId, target, tx as unknown as Db);
      if (!r.ok) throw new HttpError(409, "The import still has errors and cannot be committed", { issues: r.issues.filter((i) => i.severity === "error").slice(0, 200) }, "VALIDATION_FAILED");
      const max = await tx.timetableGeneration.aggregate({ where: { semesterId: target.semesterId }, _max: { version: true } });
      const gen = await tx.timetableGeneration.create({
        data: {
          semesterId: target.semesterId, version: (max._max.version ?? 0) + 1, name: target.name ?? `Imported from PDF`,
          source: "IMPORTED", status: "COMPLETED", sectionIds: [target.sectionId], config: { importedFromJob: jobId },
          progress: 100, progressMessage: "Imported", createdById: userId, completedAt: new Date(), startedAt: new Date(),
        },
      });
      await tx.timetableEntry.createMany({ data: r.resolved.entries.map((e) => ({ ...e, generationId: gen.id })) });
      await refreshConflicts(gen.id, tx as unknown as Db);
      await tx.ingestionJob.update({
        where: { id: jobId },
        data: { status: "DONE", reviewedAt: new Date(), completedAt: new Date(), createdRows: r.resolved.entries.length, committedGenerationId: gen.id, semesterId: target.semesterId },
      });
      return { generationId: gen.id, entries: r.resolved.entries.length };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  await publishEvent({ type: "ingestion.committed", jobId, generationId: out.generationId });
  return out;
}

export async function discardStaged(jobId: string) {
  const job = await loadReviewJob(jobId);
  if (job.status !== "AWAITING_REVIEW") throw new HttpError(409, `Job is ${job.status}`);
  return prisma.ingestionJob.update({ where: { id: jobId }, data: { status: "CANCELLED", completedAt: new Date() } });
}
