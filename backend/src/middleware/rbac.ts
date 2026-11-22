import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../lib/config";

export type Role = "ADMIN" | "DEAN" | "HOD" | "COORDINATOR" | "PROFESSOR";

export const HIERARCHY: Record<Role, number> = {
  ADMIN: 5, DEAN: 4, HOD: 3, COORDINATOR: 2, PROFESSOR: 1,
};

export interface AuthUser {
  /** User id (numeric). The JWT carries it as the string `sub`. */
  id: number;
  email: string;
  role: Role;
  departmentId: number;
}

declare global {
  namespace Express {
    interface Request { user?: AuthUser; }
  }
}

/** Verify a bearer token string. Returns null if invalid/expired. Shared by HTTP and WebSocket auth. */
export function verifyToken(token: string): AuthUser | null {
  try {
    const p = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] }) as unknown as Record<string, unknown>;
    const id = Number(p.sub);
    const role = p.role as Role;
    if (!Number.isInteger(id) || !(role in HIERARCHY)) return null;
    return { id, email: String(p.email), role, departmentId: Number(p.departmentId) };
  } catch {
    return null;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized", correlationId: req.correlationId });
  }
  const user = verifyToken(authHeader.slice("Bearer ".length));
  if (!user) return res.status(401).json({ error: "Invalid or expired token", correlationId: req.correlationId });
  req.user = user;
  next();
}

export function requireRole(minimumRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized", correlationId: req.correlationId });
    if ((HIERARCHY[req.user.role] ?? 0) < HIERARCHY[minimumRole]) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Requires ${minimumRole} or higher. Your role: ${req.user.role}`,
        correlationId: req.correlationId,
      });
    }
    next();
  };
}

/**
 * Department scoping. ADMIN and DEAN act institution-wide; HOD and COORDINATOR
 * only inside their own department; PROFESSOR never manages anything.
 */
export function canManageDepartment(user: AuthUser, departmentId: number): boolean {
  if (user.role === "ADMIN" || user.role === "DEAN") return true;
  if (user.role === "HOD" || user.role === "COORDINATOR") return user.departmentId === departmentId;
  return false;
}

/** Nobody can create or promote an account above their own level; only ADMIN may mint ADMINs. */
export function canAssignRole(actor: AuthUser, target: Role): boolean {
  if (actor.role === "ADMIN") return true;
  return HIERARCHY[target] < HIERARCHY[actor.role];
}

/** Express guard: 403 unless the caller may manage the department resolved by `getDeptId`. */
export function requireDepartmentAccess(getDeptId: (req: Request) => number | undefined | Promise<number | undefined>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized", correlationId: req.correlationId });
    try {
      const deptId = await getDeptId(req);
      if (deptId === undefined) return next(); // resource not found / not resolvable: let the route produce its own 404/400
      if (!canManageDepartment(req.user, deptId)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You can only manage resources in your own department",
          correlationId: req.correlationId,
        });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
