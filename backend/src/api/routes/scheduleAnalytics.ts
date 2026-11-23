import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/rbac";
import { asyncHandler } from "../../lib/httpError";
import { computeScheduleAnalytics } from "../../services/analyticsService";

const router = Router();
router.get("/", authenticate, asyncHandler(async (req, res) => {
  const q = z.object({
    semesterId: z.coerce.number().int().positive(),
    generationId: z.coerce.number().int().positive().optional(),
    departmentId: z.coerce.number().int().positive().optional(),
  }).parse(req.query);
  res.json(await computeScheduleAnalytics(q));
}));
export default router;
