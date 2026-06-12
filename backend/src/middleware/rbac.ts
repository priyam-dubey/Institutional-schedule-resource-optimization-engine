import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type Role = "ADMIN" | "DEAN" | "HOD" | "COORDINATOR" | "PROFESSOR";

const HIERARCHY: Record<Role, number> = {
  ADMIN: 5, DEAN: 4, HOD: 3, COORDINATOR: 2, PROFESSOR: 1,
};

interface JwtPayload {
  sub: number; email: string; role: Role; departmentId: number; iat: number; exp: number;
}

declare global {
  namespace Express {
    interface Request { user?: JwtPayload; }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized", correlationId: req.correlationId });
  }
  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? "dev_secret") as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token", correlationId: req.correlationId });
  }
}

export function requireRole(minimumRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized", correlationId: req.correlationId });
    if ((HIERARCHY[req.user.role] ?? 0) < (HIERARCHY[minimumRole] ?? 99)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Requires ${minimumRole}+. Your role: ${req.user.role}`,
        correlationId: req.correlationId,
      });
    }
    next();
  };
}
