import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/rbac";
import { asyncHandler, HttpError } from "../../lib/httpError";
import { generationQueue } from "../../lib/queues";
import {
  archiveGeneration, cancelGeneration, createGeneration, publishGeneration,
  regenerate, unpublishGeneration, validateGeneration, type Enqueuer,
} from "../../services/generationService";

const router = Router();
router.use(authenticate);

export const enqueueGeneration: Enqueuer = async (id) => {
  const job = await generationQueue.add("generate", { generationId: id }, { attempts: 1, removeOnComplete: 100, removeOnFail: 200 });
  return job.id;
};

const idParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
};

async function loadAccessible(req: Parameters<Parameters<typeof asyncHandler>[0]>[0], id: number) {
  const g = await prisma.timetableGeneration.findUnique({ where: { id } });
  if (!g) throw new HttpError(404, "Generation not found");
  const u = req.user!;
  if (u.role === "HOD" || u.role === "COORDINATOR" || u.role === "PROFESSOR") {
    const secs = await prisma.section.findMany({ where: { id: { in: g.sectionIds } }, include: { program: { select: { departmentId: true } } } });
    if (secs.some((s) => s.program.departmentId !== u.departmentId)) throw new HttpError(403, "This timetable covers other departments");
  }
  return g;
}

const CreateSchema = z.object({
  semesterId: z.number().int().positive(),
  sectionIds: z.array(z.number().int().positive()).min(1).max(500),
  name: z.string().min(1).max(200).optional(),
  config: z.unknown().optional(),
});

router.post("/", requireRole("HOD"), asyncHandler(async (req, res) => {
  const b = CreateSchema.parse(req.body);
  const gen = await createGeneration({ ...b, user: req.user! }, enqueueGeneration);
  res.status(202).json(gen);
}));

router.get("/", asyncHandler(async (req, res) => {
  const semesterId = req.query.semesterId ? idParam(String(req.query.semesterId)) : undefined;
  const items = await prisma.timetableGeneration.findMany({
    where: { ...(semesterId ? { semesterId } : {}), ...(req.query.publishStatus ? { publishStatus: String(req.query.publishStatus) as never } : {}) },
    orderBy: [{ semesterId: "desc" }, { version: "desc" }],
    take: 200,
    include: { _count: { select: { entries: true, conflicts: true } } },
  });
  res.json({ items });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const g = await prisma.timetableGeneration.findUnique({
    where: { id: idParam(req.params.id) },
    include: { _count: { select: { entries: true, conflicts: true } } },
  });
  if (!g) throw new HttpError(404, "Generation not found");
  const byKind = await prisma.generationConflict.groupBy({ by: ["kind"], where: { generationId: g.id }, _count: { _all: true } });
  res.json({ ...g, conflictCounts: Object.fromEntries(byKind.map((k) => [k.kind, k._count._all])) });
}));

router.get("/:id/conflicts", asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const kind = req.query.kind ? z.enum(["HARD", "UNASSIGNED", "INFEASIBLE"]).parse(req.query.kind) : undefined;
  const items = await prisma.generationConflict.findMany({ where: { generationId: id, ...(kind ? { kind } : {}) }, orderBy: { id: "asc" }, take: 1000 });
  res.json({ items });
}));

router.get("/:id/validate", requireRole("COORDINATOR"), asyncHandler(async (req, res) => {
  res.json(await validateGeneration(idParam(req.params.id)));
}));

router.post("/:id/regenerate", requireRole("HOD"), asyncHandler(async (req, res) => {
  const g = await loadAccessible(req, idParam(req.params.id));
  const overrides = req.body && Object.keys(req.body).length ? req.body : undefined;
  res.status(202).json(await regenerate(g.id, req.user!, enqueueGeneration, overrides));
}));

router.post("/:id/cancel", requireRole("HOD"), asyncHandler(async (req, res) => {
  const g = await loadAccessible(req, idParam(req.params.id));
  res.json(await cancelGeneration(g.id));
}));

router.post("/:id/publish", requireRole("DEAN"), asyncHandler(async (req, res) => {
  const b = z.object({ allowPartial: z.boolean().optional(), replace: z.boolean().optional() }).parse(req.body ?? {});
  res.json(await publishGeneration(idParam(req.params.id), req.user!, b));
}));

router.post("/:id/unpublish", requireRole("DEAN"), asyncHandler(async (req, res) => {
  res.json(await unpublishGeneration(idParam(req.params.id)));
}));

router.post("/:id/archive", requireRole("HOD"), asyncHandler(async (req, res) => {
  const g = await loadAccessible(req, idParam(req.params.id));
  res.json(await archiveGeneration(g.id));
}));

router.delete("/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const g = await loadAccessible(req, idParam(req.params.id));
  if (g.publishStatus === "PUBLISHED") throw new HttpError(409, "Unpublish the timetable before deleting it");
  if (g.status === "QUEUED" || g.status === "RUNNING") throw new HttpError(409, "Cancel the running generation first");
  await prisma.timetableGeneration.delete({ where: { id: g.id } });
  res.status(204).end();
}));

export default router;
