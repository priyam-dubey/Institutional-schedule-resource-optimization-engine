import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/rbac";
import { analyticsQueue } from "../../lib/queues";

const router = Router();

const CourseSchema = z.object({
  code:     z.string().min(2).max(20),
  name:     z.string().min(2).max(300),
  credits:  z.number().min(0).max(10),   // 0 = NC (Non-Credit)
  type:     z.enum(["LECTURE", "LAB", "TUTORIAL"]),
  branchId: z.number().int().positive(),
  semester: z.number().int().min(1).max(10),
});

// GET /api/courses?branch=&semester=&type=&search=
router.get("/", authenticate, async (req, res) => {
  const { search = "", branch, semester, type, page = "1", limit = "20" } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  if (search)   where.OR = [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }];
  if (branch)   where.branch = { code: branch.toUpperCase() };
  if (semester) where.semester = Number(semester);
  if (type)     where.type = type.toUpperCase();

  const [courses, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      skip,
      take: Number(limit),
      include: { branch: { select: { code: true } } },
      orderBy: [{ semester: "asc" }, { code: "asc" }],
    }),
    prisma.course.count({ where }),
  ]);

  // Attach scheduled slot count vs required
  const allSlots = await prisma.timetableSlot.groupBy({ by: ["courseId"], _count: { id: true } });
  const slotMap = new Map(allSlots.map(s => [s.courseId, s._count.id]));

  const enriched = courses.map(c => {
    const scheduled = slotMap.get(c.id) ?? 0;
    const required  = Math.ceil(Number(c.credits) * 2);
    return { ...c, scheduled, required, underRunning: Number(c.credits) > 0 && scheduled < required };
  });

  res.json({ data: enriched, meta: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
});

// POST /api/courses
router.post("/", authenticate, requireRole("COORDINATOR"), async (req, res) => {
  const parsed = CourseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });

  try {
    const course = await prisma.course.create({ data: { ...parsed.data, credits: parsed.data.credits } });
    await analyticsQueue.add("recompute", { trigger: "mutation", entityType: "courses" });
    res.status(201).json(course);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Course code already exists for this branch+semester", correlationId: req.correlationId });
    throw e;
  }
});

// PUT /api/courses/:id
router.put("/:id", authenticate, requireRole("COORDINATOR"), async (req, res) => {
  const parsed = CourseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

  try {
    const course = await prisma.course.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(course);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "Course not found" });
    throw e;
  }
});

// DELETE /api/courses/:id
router.delete("/:id", authenticate, requireRole("HOD"), async (req, res) => {
  const slotCount = await prisma.timetableSlot.count({ where: { courseId: Number(req.params.id) } });
  if (slotCount > 0) {
    return res.status(409).json({
      error: "Cannot delete: " + slotCount + " timetable slot(s) reference this course",
      correlationId: req.correlationId,
    });
  }
  await prisma.course.delete({ where: { id: Number(req.params.id) } });
  res.status(204).send();
});

export default router;
