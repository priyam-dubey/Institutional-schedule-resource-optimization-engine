import { z } from "zod";
import type { DayOfWeek, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { publishEvent } from "../lib/events";
import { validateAssignments } from "../scheduler/validator";
import { runSolver, SolveCancelled } from "../scheduler/runSolver";
import type { SchedulerResult, Violation } from "../scheduler/types";
import { buildInput, type BuiltInput, type Db } from "./scheduleInput";
import type { AuthUser } from "../middleware/rbac";

export const GenerationConfigSchema = z
  .object({
    seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
    timeLimitMs: z.number().int().min(1000).max(300_000).default(30_000),
    maxBacktracks: z.number().int().min(100).max(10_000_000).optional(),
    restarts: z.number().int().min(0).max(100).optional(),
    branchLimit: z.number().int().min(1).max(500).optional(),
    localSearchPasses: z.number().int().min(0).max(20).optional(),
    maxStudentStreak: z.number().int().min(1).max(10).optional(),
    weights: z.record(z.number().min(0).max(100)).optional(),
  })
  .strict();
export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;

const db = (): Db => prisma as unknown as Db;
const num = (s: string) => Number(s.slice(1));

/** Hooks so the queue is injectable (tests / no-redis callers). */
export interface Enqueuer {
  (generationId: number): Promise<string | undefined>;
}

export async function assertSectionAccess(user: AuthUser, semesterId: number, sectionIds: number[]) {
  const sections = await prisma.section.findMany({
    where: { id: { in: sectionIds } },
    include: { program: { select: { departmentId: true } } },
  });
  const found = new Set(sections.map((s) => s.id));
  const missing = sectionIds.filter((id) => !found.has(id));
  if (missing.length) throw new HttpError(404, `Sections not found: ${missing.join(", ")}`);
  const wrongSem = sections.filter((s) => s.semesterId !== semesterId);
  if (wrongSem.length) throw new HttpError(422, `Sections ${wrongSem.map((s) => s.id).join(", ")} belong to a different semester`);
  if (user.role === "HOD" || user.role === "COORDINATOR" || user.role === "PROFESSOR") {
    const foreign = sections.filter((s) => s.program.departmentId !== user.departmentId);
    if (foreign.length) throw new HttpError(403, "You can only generate timetables for sections of your own department");
  }
}

export async function createGeneration(
  p: { semesterId: number; sectionIds: number[]; name?: string; config?: unknown; user: AuthUser },
  enqueue: Enqueuer,
) {
  const config = GenerationConfigSchema.parse(p.config ?? {});
  const sectionIds = [...new Set(p.sectionIds)].sort((a, b) => a - b);
  if (!sectionIds.length) throw new HttpError(400, "At least one section is required");
  const semester = await prisma.semester.findUnique({ where: { id: p.semesterId } });
  if (!semester) throw new HttpError(404, "Semester not found");
  await assertSectionAccess(p.user, p.semesterId, sectionIds);

  let gen;
  for (let attempt = 0; ; attempt++) {
    try {
      const max = await prisma.timetableGeneration.aggregate({ where: { semesterId: p.semesterId }, _max: { version: true } });
      gen = await prisma.timetableGeneration.create({
        data: {
          semesterId: p.semesterId,
          version: (max._max.version ?? 0) + 1,
          name: p.name,
          sectionIds,
          config: config as Prisma.InputJsonValue,
          createdById: p.user.id,
        },
      });
      break;
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" && attempt < 5) continue; // version race
      throw e;
    }
  }
  try {
    const jobId = await enqueue(gen.id);
    if (jobId) gen = await prisma.timetableGeneration.update({ where: { id: gen.id }, data: { jobId } });
  } catch (e) {
    await prisma.timetableGeneration.update({
      where: { id: gen.id },
      data: { status: "FAILED", errorMessage: `Could not enqueue job: ${(e as Error).message}` },
    });
    throw new HttpError(503, "The job queue is unavailable; the generation was not started");
  }
  await publishEvent({ type: "generation.queued", generationId: gen.id, semesterId: gen.semesterId });
  return gen;
}

export async function regenerate(id: number, user: AuthUser, enqueue: Enqueuer, overrides?: unknown) {
  const src = await prisma.timetableGeneration.findUnique({ where: { id } });
  if (!src) throw new HttpError(404, "Generation not found");
  const base = GenerationConfigSchema.parse(src.config);
  const merged = { ...base, seed: Math.floor(Math.random() * 2 ** 31), ...(overrides as object | undefined) };
  return createGeneration(
    { semesterId: src.semesterId, sectionIds: src.sectionIds, name: src.name ? `${src.name} (regenerated)` : undefined, config: merged, user },
    enqueue,
  );
}

export async function cancelGeneration(id: number) {
  const g = await prisma.timetableGeneration.findUnique({ where: { id } });
  if (!g) throw new HttpError(404, "Generation not found");
  if (g.status !== "QUEUED" && g.status !== "RUNNING") throw new HttpError(409, `Generation is already ${g.status}`);
  await prisma.timetableGeneration.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date(), progressMessage: "Cancelled" } });
  await publishEvent({ type: "generation.cancelled", generationId: id });
  return prisma.timetableGeneration.findUnique({ where: { id } });
}

// ── worker side ─────────────────────────────────────────────────────────────

/** Executes a generation. Called by the BullMQ worker; independent of the queue so tests can call it directly. */
export async function runGeneration(generationId: number): Promise<void> {
  const gen = await prisma.timetableGeneration.findUnique({ where: { id: generationId } });
  if (!gen) return;
  if (gen.status === "CANCELLED" || gen.status === "COMPLETED") return;

  const emit = (progress: number, message: string, status = "RUNNING") =>
    publishEvent({ type: "generation.progress", generationId, semesterId: gen.semesterId, status, progress, message });
  const started = Date.now();
  let lastWrite = 0;
  try {
    await prisma.timetableGeneration.update({
      where: { id: generationId },
      data: { status: "RUNNING", startedAt: new Date(), progress: 2, progressMessage: "Loading data" },
    });
    await emit(2, "Loading data");

    const cfg = GenerationConfigSchema.parse(gen.config);
    const built = await buildInput({ semesterId: gen.semesterId, sectionIds: gen.sectionIds, mode: "generate", config: cfg });
    if (!built.input.requirements.length) throw new HttpError(422, "The selected sections have no subject requirements to schedule");
    await prisma.timetableGeneration.update({ where: { id: generationId }, data: { progress: 8, progressMessage: `Solving ${built.input.requirements.length} requirements` } });
    await emit(8, `Solving ${built.input.requirements.length} requirements`);

    const run = runSolver(built.input, (p) => {
      const now = Date.now();
      if (now - lastWrite < 400) return;
      lastWrite = now;
      const frac = p.total ? p.placed / p.total : 0;
      const pct = Math.min(90, 8 + Math.round(frac * 70) + (p.phase === "greedy" ? 6 : p.phase === "local-search" ? 10 : 0));
      const msg = `${p.phase}: ${p.placed}/${p.total} sessions placed`;
      void emit(pct, msg);
      void prisma.timetableGeneration.update({ where: { id: generationId }, data: { progress: pct, progressMessage: msg } }).catch(() => undefined);
    });

    // poll for cancellation requested through the API
    const poll = setInterval(async () => {
      const cur = await prisma.timetableGeneration.findUnique({ where: { id: generationId }, select: { status: true } }).catch(() => null);
      if (cur?.status === "CANCELLED") run.cancel();
    }, 750);
    let result: SchedulerResult;
    try {
      result = await run.promise;
    } finally {
      clearInterval(poll);
    }

    await emit(93, "Saving results");
    const warnings = built.warnings;
    await persistResult(generationId, built, result, warnings, Date.now() - started);
    await emit(100, `Finished: ${result.assignedSessions}/${result.totalSessions} sessions`, "COMPLETED");
    await publishEvent({ type: "generation.completed", generationId, semesterId: gen.semesterId, solveStatus: result.status });
  } catch (e) {
    if (e instanceof SolveCancelled) {
      await prisma.timetableGeneration.updateMany({ where: { id: generationId }, data: { status: "CANCELLED", completedAt: new Date() } });
      return;
    }
    const msg = (e as Error).message;
    await prisma.timetableGeneration.updateMany({
      where: { id: generationId, status: { not: "CANCELLED" } },
      data: { status: "FAILED", errorMessage: msg.slice(0, 2000), completedAt: new Date(), progressMessage: "Failed" },
    });
    await publishEvent({ type: "generation.failed", generationId, semesterId: gen.semesterId, error: msg });
    if (!(e instanceof HttpError) && (e as { status?: number }).status === undefined) throw e; // unexpected: let BullMQ record it
  }
}

async function persistResult(generationId: number, built: BuiltInput, result: SchedulerResult, warnings: string[], durationMs: number) {
  const entries = result.assignments.map((a) => {
    const meta = built.reqMeta.get(a.requirementId)!;
    return {
      generationId,
      requirementId: meta.requirementId,
      sessionIndex: a.sessionIndex,
      sectionId: meta.sectionId,
      batchId: meta.batchId,
      subjectId: meta.subjectId,
      facultyProfileId: num(a.facultyId),
      roomId: num(a.roomId),
      day: built.days[a.day] as DayOfWeek,
      startPeriod: a.startPeriod,
      length: a.length,
    };
  });
  const conflicts: Prisma.GenerationConflictCreateManyInput[] = [];
  for (const u of result.unassigned) {
    const meta = built.reqMeta.get(u.requirementId);
    conflicts.push({
      generationId,
      kind: "UNASSIGNED",
      code: "UNASSIGNED_SESSION",
      message: `${meta?.label ?? u.requirementId}: session ${u.sessionIndex + 1} could not be placed. ${u.reasons[0] ?? ""}`.trim(),
      requirementId: meta?.requirementId ?? null,
      sectionId: meta?.sectionId ?? null,
      details: { sessionIndex: u.sessionIndex, reasons: u.reasons } as Prisma.InputJsonValue,
    });
  }
  for (const p of result.infeasibilityProofs) {
    conflicts.push({ generationId, kind: "INFEASIBLE", code: p.kind, message: p.message });
  }
  for (const v of result.hardViolations) {
    const meta = v.requirementId ? built.reqMeta.get(v.requirementId) : undefined;
    conflicts.push({
      generationId,
      kind: "HARD",
      code: v.type,
      message: v.message,
      requirementId: meta?.requirementId ?? null,
      sectionId: meta?.sectionId ?? null,
      facultyProfileId: v.facultyId ? num(v.facultyId) : null,
      roomId: v.roomId ? num(v.roomId) : null,
      day: v.day !== undefined ? (built.days[v.day] ?? null) : null,
      periodIndex: v.period ?? null,
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.timetableEntry.deleteMany({ where: { generationId } });
    await tx.generationConflict.deleteMany({ where: { generationId } });
    if (entries.length) await tx.timetableEntry.createMany({ data: entries });
    if (conflicts.length) await tx.generationConflict.createMany({ data: conflicts });
    const cur = await tx.timetableGeneration.findUnique({ where: { id: generationId }, select: { status: true } });
    if (cur?.status === "CANCELLED") return; // cancelled while saving: keep the cancellation
    await tx.timetableGeneration.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        solveStatus: result.status,
        progress: 100,
        progressMessage: "Completed",
        score: result.score,
        totalSessions: result.totalSessions,
        assignedSessions: result.assignedSessions,
        penalties: result.penalties as unknown as Prisma.InputJsonValue,
        stats: { ...result.stats, warnings } as unknown as Prisma.InputJsonValue,
        durationMs,
        completedAt: new Date(),
      },
    });
  });
}

// ── validation & publishing ────────────────────────────────────────────────

export interface ValidationReport {
  valid: boolean;
  complete: boolean;
  violations: { type: string; message: string; sectionId?: number; requirementId?: number | null; day?: DayOfWeek; period?: number }[];
  totalViolations: number;
}

export async function validateGeneration(generationId: number, client: Db = db()): Promise<ValidationReport> {
  const gen = await client.timetableGeneration.findUnique({ where: { id: generationId } });
  if (!gen) throw new HttpError(404, "Generation not found");
  const built = await buildInput({ semesterId: gen.semesterId, sectionIds: gen.sectionIds, mode: "validate", generationId, db: client });
  const primary = new Set(gen.sectionIds);
  const mustBeComplete = new Set(
    [...built.reqMeta.entries()].filter(([, m]) => m.requirementId !== null && primary.has(m.sectionId)).map(([id]) => id),
  );
  const all: Violation[] = validateAssignments(built.input, built.assignments, { requireComplete: mustBeComplete });
  const hard = all.filter((v) => v.type !== "SESSION_COUNT_UNMET");
  const incomplete = all.some((v) => v.type === "SESSION_COUNT_UNMET");
  const toView = (v: Violation) => {
    const m = v.requirementId ? built.reqMeta.get(v.requirementId) : undefined;
    return {
      type: v.type,
      message: v.message,
      sectionId: m?.sectionId,
      requirementId: m?.requirementId ?? null,
      day: v.day !== undefined && v.day >= 0 ? built.days[v.day] : undefined,
      period: v.period,
    };
  };
  const list = all.map(toView);
  return { valid: hard.length === 0, complete: !incomplete, violations: list.slice(0, 200), totalViolations: list.length };
}

export async function publishGeneration(
  generationId: number,
  user: AuthUser,
  opts: { allowPartial?: boolean; replace?: boolean } = {},
) {
  const result = await prisma.$transaction(
    async (tx) => {
      const gen = await tx.timetableGeneration.findUnique({ where: { id: generationId } });
      if (!gen) throw new HttpError(404, "Generation not found");
      // serialise publish/edit operations per semester
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${gen.semesterId}::bigint)`;
      const fresh = await tx.timetableGeneration.findUniqueOrThrow({ where: { id: generationId } });
      if (fresh.status !== "COMPLETED") throw new HttpError(409, `Only a COMPLETED generation can be published (this one is ${fresh.status})`);
      if (fresh.publishStatus === "PUBLISHED") throw new HttpError(409, "This generation is already published");
      if (fresh.publishStatus === "ARCHIVED") throw new HttpError(409, "Archived generations cannot be published; create a new generation");
      if (fresh.solveStatus === "INVALID") throw new HttpError(409, "The solver reported an invalid result; regenerate before publishing", undefined, "INVALID_RESULT");
      const entryCount = await tx.timetableEntry.count({ where: { generationId } });
      if (entryCount === 0) throw new HttpError(409, "The timetable has no entries", undefined, "EMPTY");

      const report = await validateGeneration(generationId, tx);
      if (!report.valid) {
        throw new HttpError(409, `The timetable has ${report.totalViolations} hard-constraint violation(s) and cannot be published`, report, "VALIDATION_FAILED");
      }
      if (!report.complete && !opts.allowPartial) {
        throw new HttpError(409, "The timetable is incomplete (some sessions are unassigned). Pass allowPartial to publish it anyway.", report, "INCOMPLETE");
      }

      const overlapping = await tx.timetableGeneration.findMany({
        where: { semesterId: fresh.semesterId, publishStatus: "PUBLISHED", id: { not: generationId }, sectionIds: { hasSome: fresh.sectionIds } },
        select: { id: true, version: true, sectionIds: true },
      });
      if (overlapping.length && !opts.replace) {
        throw new HttpError(409, "Another published timetable already covers some of these sections. Pass replace to archive it.", { overlapping }, "SECTION_OVERLAP");
      }
      if (overlapping.length) {
        await tx.timetableGeneration.updateMany({ where: { id: { in: overlapping.map((o) => o.id) } }, data: { publishStatus: "ARCHIVED" } });
      }
      const pub = await tx.timetableGeneration.update({
        where: { id: generationId },
        data: { publishStatus: "PUBLISHED", publishedAt: new Date(), publishedById: user.id },
      });
      return { generation: pub, archived: overlapping.map((o) => o.id), complete: report.complete };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  await publishEvent({ type: "timetable.published", generationId, semesterId: result.generation.semesterId });
  return result;
}

export async function unpublishGeneration(generationId: number) {
  const g = await prisma.timetableGeneration.findUnique({ where: { id: generationId } });
  if (!g) throw new HttpError(404, "Generation not found");
  if (g.publishStatus !== "PUBLISHED") throw new HttpError(409, "Generation is not published");
  const out = await prisma.timetableGeneration.update({ where: { id: generationId }, data: { publishStatus: "DRAFT", publishedAt: null, publishedById: null } });
  await publishEvent({ type: "timetable.unpublished", generationId, semesterId: g.semesterId });
  return out;
}

export async function archiveGeneration(generationId: number) {
  const g = await prisma.timetableGeneration.findUnique({ where: { id: generationId } });
  if (!g) throw new HttpError(404, "Generation not found");
  if (g.status === "QUEUED" || g.status === "RUNNING") throw new HttpError(409, "Cancel the running generation first");
  return prisma.timetableGeneration.update({ where: { id: generationId }, data: { publishStatus: "ARCHIVED" } });
}
