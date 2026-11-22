import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole, requireDepartmentAccess } from "../../middleware/rbac";
import { analyticsQueue } from "../../lib/queues";

const router = Router();

const RoomSchema = z.object({
  roomNumber:   z.string().min(1).max(50),
  departmentId: z.number().int().positive(),
  capacity:     z.number().int().positive().nullable().optional(),
  type:         z.enum(["CLASSROOM", "LAB", "OTHER"]).default("CLASSROOM"),
});

// GET /api/rooms?search=&dept=&type=&page=1&limit=20
router.get("/", authenticate, async (req, res) => {
  const { search = "", dept, type, page = "1", limit = "20" } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  if (search) where.roomNumber = { contains: search, mode: "insensitive" };
  if (dept)   where.department = { code: dept.toUpperCase() };
  if (type)   where.type = type.toUpperCase();

  const [rooms, total] = await prisma.$transaction([
    prisma.room.findMany({
      where,
      skip,
      take: Number(limit),
      include: { department: { select: { code: true, name: true } } },
      orderBy: [{ departmentId: "asc" }, { roomNumber: "asc" }],
    }),
    prisma.room.count({ where }),
  ]);

  // Attach utilization computed on the fly
  const allSlots = await prisma.timetableSlot.groupBy({
    by: ["roomId"],
    _count: { id: true },
  });
  const slotMap = new Map<number, number>(allSlots.map((s: { roomId: number; _count: { id: number } }) => [s.roomId, s._count.id]));

  const PERIODS_PER_DAY = 8, WORKING_DAYS = 5;
  const roomsWithUtil = rooms.map((r: (typeof rooms)[number]) => ({
    ...r,
    occupiedSlots: slotMap.get(r.id) ?? 0,
    availableSlots: PERIODS_PER_DAY * WORKING_DAYS,
    utilization: Math.round(((slotMap.get(r.id) ?? 0) / (PERIODS_PER_DAY * WORKING_DAYS)) * 100),
    capacityMissing: r.capacity === null,
  }));

  res.json({ data: roomsWithUtil, meta: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
});

// POST /api/rooms
router.post("/", authenticate, requireRole("COORDINATOR"), requireDepartmentAccess((req) => (typeof req.body?.departmentId === "number" ? req.body.departmentId : undefined)), async (req, res) => {
  const parsed = RoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues, correlationId: req.correlationId });

  try {
    const room = await prisma.room.create({ data: parsed.data });
    await analyticsQueue.add("recompute", { trigger: "mutation", entityType: "rooms" });
    res.status(201).json(room);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Room number already exists in this department", correlationId: req.correlationId });
    throw e;
  }
});

// PUT /api/rooms/:id
router.put("/:id", authenticate, requireRole("COORDINATOR"), requireDepartmentAccess(async (req) => (await prisma.room.findUnique({ where: { id: Number(req.params.id) }, select: { departmentId: true } }))?.departmentId), async (req, res) => {
  const parsed = RoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

  try {
    const room = await prisma.room.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    await analyticsQueue.add("recompute", { trigger: "mutation", entityType: "rooms" });
    res.json(room);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "Room not found" });
    throw e;
  }
});

// DELETE /api/rooms/:id — blocked if timetable slots reference it
router.delete("/:id", authenticate, requireRole("HOD"), requireDepartmentAccess(async (req) => (await prisma.room.findUnique({ where: { id: Number(req.params.id) }, select: { departmentId: true } }))?.departmentId), async (req, res) => {
  const slotCount = await prisma.timetableSlot.count({ where: { roomId: Number(req.params.id) } });
  if (slotCount > 0) {
    return res.status(409).json({
      error: "Cannot delete: " + slotCount + " timetable slot(s) reference this room",
      correlationId: req.correlationId,
    });
  }
  await prisma.room.delete({ where: { id: Number(req.params.id) } });
  res.status(204).send();
});

export default router;
