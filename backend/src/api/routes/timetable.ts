import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/rbac";
import { analyticsQueue } from "../../lib/queues";

const router = Router();

const SlotSchema = z.object({
  courseId:  z.number().int().positive(),
  roomId:    z.number().int().positive(),
  facultyId: z.number().int().positive().nullable().optional(),
  dayOfWeek: z.enum(["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"]),
  period:    z.enum(["I","II","III","IV","V","VII","VIII","IX"]),
  semester:  z.number().int().min(1).max(10),
  branch:    z.string().min(1).max(20),
});

// GET /api/timetable?branch=CS&semester=6
router.get("/", authenticate, async (req, res) => {
  const { branch, semester, facultyId, roomId } = req.query as Record<string, string>;
  const where: any = {};
  if (branch)    where.branch = branch.toUpperCase();
  if (semester)  where.semester = Number(semester);
  if (facultyId) where.facultyId = Number(facultyId);
  if (roomId)    where.roomId = Number(roomId);

  const slots = await prisma.timetableSlot.findMany({
    where,
    include: {
      course:  { select: { code: true, name: true, type: true, credits: true } },
      room:    { select: { roomNumber: true, type: true } },
      faculty: { select: { name: true, email: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  // Reshape into a grid: { [day]: { [period]: slot } }
  const grid: Record<string, Record<string, typeof slots[number]>> = {};
  for (const slot of slots) {
    if (!grid[slot.dayOfWeek]) grid[slot.dayOfWeek] = {};
    grid[slot.dayOfWeek][slot.period] = slot;
  }

  res.json({ slots, grid });
});

// POST /api/timetable
router.post("/", authenticate, requireRole("COORDINATOR"), async (req, res) => {
  const parsed = SlotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });

  try {
    const slot = await prisma.timetableSlot.create({
      data: parsed.data,
      include: { course: true, room: true, faculty: true },
    });
    await analyticsQueue.add("recompute", { trigger: "mutation", entityType: "timetable" });
    res.status(201).json(slot);
  } catch (e: any) {
    if (e.code === "P2002") {
      return res.status(409).json({
        error: "Slot conflict: this room is already booked for that day/period/semester/branch",
        correlationId: req.correlationId,
      });
    }
    throw e;
  }
});

// DELETE /api/timetable/:id
router.delete("/:id", authenticate, requireRole("COORDINATOR"), async (req, res) => {
  try {
    await prisma.timetableSlot.delete({ where: { id: Number(req.params.id) } });
    await analyticsQueue.add("recompute", { trigger: "mutation", entityType: "timetable" });
    res.status(204).send();
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "Slot not found" });
    throw e;
  }
});

export default router;
