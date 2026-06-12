import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/rbac";
import { z } from "zod";

const router = Router();

const UserSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(320),
  role: z.enum(["ADMIN","DEAN","HOD","COORDINATOR","PROFESSOR"]),
  departmentId: z.number().int().positive(),
});

router.get("/", authenticate, async (req, res) => {
  const { search = "", role, includeDeleted = "false" } = req.query as Record<string,string>;
  const showDeleted = includeDeleted === "true" && req.user?.role === "ADMIN";

  const users = await prisma.user.findMany({
    where: {
      isDeleted: showDeleted ? undefined : false,
      ...(role && { role: role as any }),
      ...(search && { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]}),
    },
    include: { department: { select: { code: true } } },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

router.post("/", authenticate, requireRole("COORDINATOR"), async (req, res) => {
  const parsed = UserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  try {
    const user = await prisma.user.create({ data: parsed.data });
    res.status(201).json(user);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Email already exists" });
    throw e;
  }
});

// Soft delete
router.delete("/:id", authenticate, requireRole("COORDINATOR"), async (req, res) => {
  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ message: "User soft-deleted. Recoverable.", user });
});

// Restore
router.post("/:id/restore", authenticate, requireRole("HOD"), async (req, res) => {
  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { isDeleted: false, deletedAt: null },
  });
  res.json({ message: "User restored.", user });
});

export default router;
