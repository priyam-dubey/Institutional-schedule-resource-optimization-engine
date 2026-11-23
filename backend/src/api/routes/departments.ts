import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { resolveInstitutionId } from "../../lib/institution";
import { authenticate, requireRole, requireDepartmentAccess } from "../../middleware/rbac";
import { analyticsQueue } from "../../lib/queues";
import { z } from "zod";

const router = Router();

const DeptSchema = z.object({
  name: z.string().min(2).max(200),
  code: z.string().min(2).max(20).toUpperCase(),
});

// GET /api/departments?search=&page=1&limit=20
router.get("/", authenticate, async (req, res) => {
  const { search = "", page = "1", limit = "20" } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);

  const where = search
    ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { code: { contains: search, mode: "insensitive" as const } }] }
    : {};

  const [departments, total] = await prisma.$transaction([
    prisma.department.findMany({ where, skip, take: Number(limit), include: { _count: { select: { rooms: true, users: true } } }, orderBy: { name: "asc" } }),
    prisma.department.count({ where }),
  ]);

  res.json({ data: departments, meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
});

// POST /api/departments
router.post("/", authenticate, requireRole("DEAN"), async (req, res) => {
  const parsed = DeptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });

  try {
    const institutionId = await resolveInstitutionId(req.user!.departmentId);
    const dept = await prisma.department.create({ data: { ...parsed.data, institutionId } });
    await analyticsQueue.add("recompute", { trigger: "mutation", entityType: "departments" });
    res.status(201).json(dept);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Department code already exists", correlationId: req.correlationId });
    throw e;
  }
});

// PUT /api/departments/:id
router.put("/:id", authenticate, requireRole("HOD"), requireDepartmentAccess((req) => Number(req.params.id)), async (req, res) => {
  const parsed = DeptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

  try {
    const dept = await prisma.department.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(dept);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "Department not found" });
    throw e;
  }
});

// DELETE /api/departments/:id
router.delete("/:id", authenticate, requireRole("DEAN"), async (req, res) => {
  // Check for dependents before deletion
  const dept = await prisma.department.findUnique({
    where: { id: Number(req.params.id) },
    include: { _count: { select: { rooms: true, users: true, branches: true } } },
  });
  if (!dept) return res.status(404).json({ error: "Department not found" });

  const dependents = dept._count.rooms + dept._count.users + dept._count.branches;
  if (dependents > 0) {
    return res.status(409).json({
      error: "Cannot delete: dependents exist",
      dependents: { rooms: dept._count.rooms, users: dept._count.users, branches: dept._count.branches },
      correlationId: req.correlationId,
    });
  }

  await prisma.department.delete({ where: { id: Number(req.params.id) } });
  res.status(204).send();
});

export default router;
