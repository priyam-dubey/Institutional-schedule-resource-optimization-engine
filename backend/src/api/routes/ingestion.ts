import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../lib/httpError";
import { commitStaged, discardStaged, loadReviewJob, savePayload, validateStaged } from "../../services/ingestionService";

const router = Router();
router.use(authenticate, requireRole("COORDINATOR"));

const Target = z.object({ semesterId: z.number().int().positive(), sectionId: z.number().int().positive() });

router.get("/", asyncHandler(async (_req, res) => {
  const items = await prisma.ingestionJob.findMany({ where: { type: "pdf-parse" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, status: true, filename: true, totalRows: true, matchedRows: true, failedRows: true, progress: true, createdAt: true, completedAt: true, committedGenerationId: true } });
  res.json({ items });
}));
router.get("/:id", asyncHandler(async (req, res) => res.json(await loadReviewJob(req.params.id))));
router.put("/:id/payload", asyncHandler(async (req, res) => res.json(await savePayload(req.params.id, req.body))));
router.post("/:id/validate", asyncHandler(async (req, res) => {
  const r = await validateStaged(req.params.id, Target.parse(req.body));
  res.json({ ok: r.ok, issues: r.issues, rows: r.resolved.entries.length });
}));
router.post("/:id/commit", asyncHandler(async (req, res) => {
  const b = Target.extend({ name: z.string().max(200).optional() }).parse(req.body);
  res.status(201).json(await commitStaged(req.params.id, b, req.user!.id));
}));
router.post("/:id/discard", asyncHandler(async (req, res) => res.json(await discardStaged(req.params.id))));

export default router;
