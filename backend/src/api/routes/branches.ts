/**
 * Branches (academic programmes within a department).
 * The Courses page needs this list to create a course; the route did not exist.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole, requireDepartmentAccess } from "../../middleware/rbac";

const router = Router();

const BranchSchema = z.object({
  name: z.string().min(2).max(200),
  code: z.string().min(1).max(20).transform((s) => s.toUpperCase().trim()),
  departmentId: z.number().int().positive(),
});

// GET /api/branches?departmentId=&search=&page=1&limit=100
router.get("/", authenticate, async (req, res) => {
  const { departmentId, search = "", page = "1", limit = "100" } = req.query as Record<string, string>;
  const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
  const where = {
    ...(departmentId && { departmentId: Number(departmentId) }),
    ...(search && { OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { code: { contains: search, mode: "insensitive" as const } },
    ]}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.branch.findMany({ where, skip, take, include: { department: { select: { code: true } } }, orderBy: [{ departmentId: "asc" }, { code: "asc" }] }),
    prisma.branch.count({ where }),
  ]);
  res.json({ data, meta: { total, page: Number(page) || 1, limit: take, pages: Math.ceil(total / take) } });
});

router.post(
  "/",
  authenticate,
  requireRole("HOD"),
  requireDepartmentAccess((req) => (typeof req.body?.departmentId === "number" ? req.body.departmentId : undefined)),
  async (req, res) => {
    const parsed = BranchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });
    try {
      res.status(201).json(await prisma.branch.create({ data: parsed.data }));
    } catch (e: any) {
      if (e.code === "P2002") return res.status(409).json({ error: "Branch code already exists in this department", correlationId: req.correlationId });
      if (e.code === "P2003") return res.status(400).json({ error: "Department does not exist", correlationId: req.correlationId });
      throw e;
    }
  },
);

export default router;
