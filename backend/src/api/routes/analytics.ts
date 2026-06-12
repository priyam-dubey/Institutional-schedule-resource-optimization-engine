import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/rbac";

const router = Router();
const PERIODS_PER_DAY = 8; // Periods I-IX minus lunch
const WORKING_DAYS = 5;

router.get("/", authenticate, async (req, res) => {
  const [rooms, slots, courses] = await Promise.all([
    prisma.room.findMany(),
    prisma.timetableSlot.findMany({ include: { room: true } }),
    prisma.course.findMany(),
  ]);

  const totalRooms = rooms.length;
  const totalAvailableSlots = totalRooms * PERIODS_PER_DAY * WORKING_DAYS;

  // Room utilization
  const roomStats = rooms.map((room) => {
    const occupied = slots.filter((s) => s.roomId === room.id).length;
    const available = PERIODS_PER_DAY * WORKING_DAYS;
    return {
      roomId: room.id,
      roomNumber: room.roomNumber,
      utilization: available > 0 ? Math.round((occupied / available) * 100) : 0,
      occupied,
      available,
    };
  });

  const avgUtilization = roomStats.length > 0
    ? Math.round(roomStats.reduce((s, r) => s + r.utilization, 0) / roomStats.length)
    : 0;

  // P(empty | slot S)
  const periodEmptyProb: Record<string, number> = {};
  const periodValues = ["I","II","III","IV","V","VII","VIII","IX"] as const;
  for (const period of periodValues) {
    const occupiedInPeriod = slots.filter((s) => s.period === period).length;
    periodEmptyProb[period] = totalRooms > 0
      ? parseFloat(((totalRooms - occupiedInPeriod) / totalRooms).toFixed(3))
      : 1;
  }

  // Under-running courses (scheduled contact slots < credits × 2 implied lectures/week)
  const underRunning = courses.filter((c) => {
    const scheduled = slots.filter((s) => s.courseId === c.id).length;
    const required = Math.ceil(Number(c.credits) * 2);
    return scheduled < required && Number(c.credits) > 0;
  }).map((c) => {
    const scheduled = slots.filter((s) => s.courseId === c.id).length;
    return { courseId: c.id, code: c.code, name: c.name, scheduled, required: Math.ceil(Number(c.credits) * 2), deficit: Math.ceil(Number(c.credits) * 2) - scheduled };
  });

  // Avg empty room-hours per day (slot duration = 50 min = 50/60 h)
  const SLOT_DURATION_HOURS = 50 / 60;
  const avgEmptyRoomHoursPerDay = parseFloat(
    (roomStats.reduce((s, r) => s + (PERIODS_PER_DAY - r.occupied / WORKING_DAYS), 0) / totalRooms * SLOT_DURATION_HOURS).toFixed(2)
  );

  res.json({
    totalRooms,
    totalAvailableSlots,
    occupiedSlots: slots.length,
    avgUtilization,
    roomStats,
    periodEmptyProbability: periodEmptyProb,
    underRunningCourses: underRunning,
    avgEmptyRoomHoursPerDay,
    computedAt: new Date().toISOString(),
    correlationId: req.correlationId,
  });
});

export default router;
