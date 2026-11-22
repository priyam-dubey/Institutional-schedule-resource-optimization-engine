import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import {
  authenticate,
  requireRole,
  canAssignRole,
  canManageDepartment,
  requireDepartmentAccess,
  type Role,
} from "../../middleware/rbac";

const router = Router();

const RoleEnum = z.enum(["ADMIN", "DEAN", "HOD", "COORDINATOR", "PROFESSOR"]);

const CreateSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(320).transform((s) => s.toLowerCase().trim()),
  role: RoleEnum,
  departmentId: z.number().int().positive(),
  /** Optional. If omitted a random temporary password is generated and returned once. */
  password: z.string().min(10).max(200).optional(),
});
const UpdateSchema = CreateSchema.omit({ password: true }).partial();

const PUBLIC_FIELDS = {
  id: true, name: true, email: true, role: true, departmentId: true,
  isDeleted: true, deletedAt: true, createdAt: true, updatedAt: true,
} as const;

function tempPassword(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars
}

router.get("/", authenticate, async (req, res) => {
  const { search = "", role, departmentId, includeDeleted = "false" } = req.query as Record<string, string>;
  const showDeleted = includeDeleted === "true" && req.user?.role === "ADMIN";

  const users = await prisma.user.findMany({
    where: {
      isDeleted: showDeleted ? undefined : false,
      ...(role && { role: role as Role }),
      ...(departmentId && { departmentId: Number(departmentId) }),
      ...(search && { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]}),
    },
    select: { ...PUBLIC_FIELDS, department: { select: { code: true } } }, // never expose passwordHash
    orderBy: { name: "asc" },
  });
  res.json(users);
});

router.post(
  "/",
  authenticate,
  requireRole("COORDINATOR"),
  requireDepartmentAccess((req) => (typeof req.body?.departmentId === "number" ? req.body.departmentId : undefined)),
  async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });
    const { password, ...data } = parsed.data;

    if (!canAssignRole(req.user!, data.role)) {
      return res.status(403).json({ error: "Forbidden", message: `You cannot create a ${data.role} account`, correlationId: req.correlationId });
    }
    const plain = password ?? tempPassword();
    try {
      const user = await prisma.user.create({
        data: { ...data, passwordHash: await bcrypt.hash(plain, 12) },
        select: PUBLIC_FIELDS,
      });
      // The temporary password is shown exactly once and never stored in plaintext.
      res.status(201).json({ ...user, ...(password ? {} : { temporaryPassword: plain }) });
    } catch (e: any) {
      if (e.code === "P2002") return res.status(409).json({ error: "Email already exists", correlationId: req.correlationId });
      throw e;
    }
  },
);

router.put(
  "/:id",
  authenticate,
  requireRole("COORDINATOR"),
  requireDepartmentAccess(async (req) => (await prisma.user.findUnique({ where: { id: Number(req.params.id) }, select: { departmentId: true } }))?.departmentId),
  async (req, res) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });
    const data = parsed.data;
    if (data.role && !canAssignRole(req.user!, data.role)) {
      return res.status(403).json({ error: "Forbidden", message: `You cannot assign the ${data.role} role`, correlationId: req.correlationId });
    }
    if (data.departmentId !== undefined && !canManageDepartment(req.user!, data.departmentId)) {
      return res.status(403).json({ error: "Forbidden", message: "You cannot move users into another department", correlationId: req.correlationId });
    }
    try {
      const user = await prisma.user.update({ where: { id: Number(req.params.id) }, data, select: PUBLIC_FIELDS });
      res.json(user);
    } catch (e: any) {
      if (e.code === "P2025") return res.status(404).json({ error: "User not found", correlationId: req.correlationId });
      if (e.code === "P2002") return res.status(409).json({ error: "Email already exists", correlationId: req.correlationId });
      throw e;
    }
  },
);

// Reset a password (ADMIN only). Returns a one-time temporary password unless one is supplied.
router.put("/:id/password", authenticate, requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ password: z.string().min(10).max(200).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  const plain = parsed.data.password ?? tempPassword();
  try {
    await prisma.user.update({ where: { id: Number(req.params.id) }, data: { passwordHash: await bcrypt.hash(plain, 12) } });
    res.json({ message: "Password updated", ...(parsed.data.password ? {} : { temporaryPassword: plain }) });
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "User not found" });
    throw e;
  }
});

// Soft delete
router.delete(
  "/:id",
  authenticate,
  requireRole("COORDINATOR"),
  requireDepartmentAccess(async (req) => (await prisma.user.findUnique({ where: { id: Number(req.params.id) }, select: { departmentId: true } }))?.departmentId),
  async (req, res) => {
    if (Number(req.params.id) === req.user!.id) return res.status(400).json({ error: "You cannot delete your own account" });
    try {
      await prisma.user.update({ where: { id: Number(req.params.id) }, data: { isDeleted: true, deletedAt: new Date() } });
      res.json({ message: "User soft-deleted. Recoverable." });
    } catch (e: any) {
      if (e.code === "P2025") return res.status(404).json({ error: "User not found" });
      throw e;
    }
  },
);

// Restore
router.post(
  "/:id/restore",
  authenticate,
  requireRole("HOD"),
  requireDepartmentAccess(async (req) => (await prisma.user.findUnique({ where: { id: Number(req.params.id) }, select: { departmentId: true } }))?.departmentId),
  async (req, res) => {
    try {
      await prisma.user.update({ where: { id: Number(req.params.id) }, data: { isDeleted: false, deletedAt: null } });
      res.json({ message: "User restored." });
    } catch (e: any) {
      if (e.code === "P2025") return res.status(404).json({ error: "User not found" });
      throw e;
    }
  },
);

export default router;
