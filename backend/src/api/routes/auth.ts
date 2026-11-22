/**
 * Auth routes. server.ts has always imported this module, but it was missing
 * from the repository, so the API could not start.
 *
 *   POST /api/auth/login  { email, password } -> { token, user }
 *   GET  /api/auth/me     -> current user (re-read from the DB, so deleted users lose access)
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { jwtSecret, JWT_TTL_SECONDS } from "../../lib/config";
import { authenticate } from "../../middleware/rbac";

const router = Router();

const LoginSchema = z.object({
  email: z.string().email().max(320).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1).max(200),
});

// Constant-ish-time response for unknown users (avoid account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

// Small in-memory throttle: 10 failures / 15 min per (ip, email). For multi-instance
// deployments move this to Redis; documented in the README.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map<string, { n: number; first: number }>();
function throttled(key: string): boolean {
  const e = fails.get(key);
  if (!e) return false;
  if (Date.now() - e.first > WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return e.n >= MAX_FAILS;
}
function recordFail(key: string) {
  const e = fails.get(key);
  if (!e || Date.now() - e.first > WINDOW_MS) fails.set(key, { n: 1, first: Date.now() });
  else e.n++;
}

router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });
  }
  const { email, password } = parsed.data;
  const key = `${req.ip}|${email}`;
  if (throttled(key)) {
    return res.status(429).json({ error: "Too many failed attempts. Try again later.", correlationId: req.correlationId });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user && !user.isDeleted ? user.passwordHash : DUMMY_HASH);
  if (!user || user.isDeleted || !ok) {
    recordFail(key);
    return res.status(401).json({ error: "Invalid credentials", message: "Invalid credentials", correlationId: req.correlationId });
  }
  fails.delete(key);

  const token = jwt.sign(
    { email: user.email, role: user.role, departmentId: user.departmentId },
    jwtSecret(),
    { subject: String(user.id), expiresIn: JWT_TTL_SECONDS, algorithm: "HS256" },
  );
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId },
  });
});

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, role: true, departmentId: true, isDeleted: true, department: { select: { code: true, name: true } } },
  });
  if (!user || user.isDeleted) return res.status(401).json({ error: "Account no longer active", correlationId: req.correlationId });
  res.json(user);
});

export default router;
