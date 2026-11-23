import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown, public code?: string) {
    super(message);
  }
}

/** Express 4 does not catch rejected promises; wrap every async handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Router-level error mapper: HttpError, ZodError, ScheduleSetupError and Prisma known errors. */
export function apiErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  const correlationId = req.correlationId;
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details, correlationId });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten(), correlationId });
  }
  const e = err as { name?: string; code?: string; status?: number; message?: string; details?: unknown; meta?: unknown };
  if (e?.name === "ScheduleSetupError" || (typeof e?.status === "number" && e.status < 500)) {
    return res.status(e.status ?? 422).json({ error: e.message, details: e.details, correlationId });
  }
  if (e?.code === "P2025") return res.status(404).json({ error: "Record not found", correlationId });
  if (e?.code === "P2002") return res.status(409).json({ error: "A record with these unique values already exists", details: e.meta, correlationId });
  if (e?.code === "P2003") return res.status(409).json({ error: "The record is referenced by, or references, other records", details: e.meta, correlationId });
  return next(err);
}
