import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request { correlationId: string; }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-correlation-id"] as string | undefined;
  req.correlationId = incoming ?? uuidv4();
  res.setHeader("X-Correlation-ID", req.correlationId);
  next();
}
