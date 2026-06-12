/**
 * BullMQ Worker: analytics-recompute
 *
 * Triggered after any DB mutation or ingestion job completion.
 * Recomputes all dashboard metrics and caches them in Redis so
 * the API's GET /api/analytics serves near-instant pre-computed results.
 * The main API event loop is never blocked by this computation.
 */
import { Worker, Job } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import type { AnalyticsJobData } from "../lib/queues";

const ANALYTICS_CACHE_KEY = "samayak:analytics:dashboard";
const CACHE_TTL_SECONDS = 300; // 5 minutes

const PERIODS_PER_DAY = 8;
const WORKING_DAYS = 5;
const SLOT_DURATION_HOURS = 50 / 60; // 50-minute periods

async function recomputeAnalytics() {
  const [rooms, slots, courses, users, departments] = await Promise.all([
    prisma.room.findMany({ include: { department: { select: { code: true } } } }),
    prisma.timetableSlot.findMany(),
    prisma.course.findMany(),
    prisma.user.findMany({ where: { isDeleted: false } }),
    prisma.department.findMany({ include: { _count: { select: { rooms: true, users: true } } } }),
  ]);

  const totalRooms = rooms.length;
  const totalAvailableSlots = totalRooms * PERIODS_PER_DAY * WORKING_DAYS;

  // ── Per-room utilization ──────────────────────────────────────────────────
  const roomStats = rooms.map(room => {
    const occupied = slots.filter(s => s.roomId === room.id).length;
    const available = PERIODS_PER_DAY * WORKING_DAYS;
    const utilization = available > 0 ? Math.round((occupied / available) * 100) : 0;
    return {
      roomId: room.id,
      roomNumber: room.roomNumber,
      department: room.department.code,
      type: room.type,
      capacity: room.capacity,
      occupied,
      available,
      utilization,
    };
  });

  const avgUtilization = roomStats.length > 0
    ? Math.round(roomStats.reduce((s, r) => s + r.utilization, 0) / roomStats.length)
    : 0;

  // ── Per-day utilization ───────────────────────────────────────────────────
  const dayKeys = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
  const dayUtilization = dayKeys.map(day => {
    const occupied = slots.filter(s => s.dayOfWeek === day).length;
    const available = totalRooms * PERIODS_PER_DAY;
    return {
      day,
      occupied,
      available,
      utilization: available > 0 ? Math.round((occupied / available) * 100) : 0,
    };
  });

  // ── P(empty | slot S) for each period ─────────────────────────────────────
  const periodKeys = ["I", "II", "III", "IV", "V", "VII", "VIII", "IX"] as const;
  const periodEmptyProbability: Record<string, number> = {};
  for (const period of periodKeys) {
    const occupiedCount = slots.filter(s => s.period === period).length;
    // Count unique rooms occupied in this period across all days
    const uniqueRoomsOccupied = new Set(
      slots.filter(s => s.period === period).map(s => s.roomId)
    ).size;
    periodEmptyProbability[period] = totalRooms > 0
      ? parseFloat(((totalRooms - uniqueRoomsOccupied) / totalRooms).toFixed(3))
      : 1.0;
  }

  // ── Under-running courses ──────────────────────────────────────────────────
  // A course is under-running when its scheduled contact slots < (credits × 2 per week)
  const underRunningCourses = courses
    .filter(c => Number(c.credits) > 0)
    .map(c => {
      const scheduled = slots.filter(s => s.courseId === c.id).length;
      const requiredPerWeek = Math.ceil(Number(c.credits) * 2);
      return { courseId: c.id, code: c.code, name: c.name, credits: Number(c.credits), scheduled, required: requiredPerWeek, deficit: requiredPerWeek - scheduled };
    })
    .filter(c => c.deficit > 0);

  // ── Average empty room-hours per day ─────────────────────────────────────
  const avgEmptyRoomHoursPerDay = totalRooms > 0
    ? parseFloat(
        (
          roomStats.reduce((sum, r) => {
            const occupiedPerDay = r.occupied / WORKING_DAYS;
            return sum + (PERIODS_PER_DAY - occupiedPerDay) * SLOT_DURATION_HOURS;
          }, 0) / totalRooms
        ).toFixed(2)
      )
    : 0;

  // ── Department-wide utilization ───────────────────────────────────────────
  const deptUtilization = departments.map(dept => {
    const deptRooms = rooms.filter(r => r.departmentId === dept.id);
    const deptSlots = slots.filter(s => deptRooms.some(r => r.id === s.roomId));
    const deptAvailable = deptRooms.length * PERIODS_PER_DAY * WORKING_DAYS;
    return {
      deptId: dept.id,
      deptCode: dept.code,
      deptName: dept.name,
      rooms: deptRooms.length,
      occupied: deptSlots.length,
      available: deptAvailable,
      utilization: deptAvailable > 0 ? Math.round((deptSlots.length / deptAvailable) * 100) : 0,
    };
  });

  return {
    summary: {
      totalRooms,
      totalFaculty: users.length,
      totalCourses: courses.length,
      totalDepartments: departments.length,
      totalAvailableSlots,
      occupiedSlots: slots.length,
      avgUtilization,
      avgEmptyRoomHoursPerDay,
    },
    roomStats,
    dayUtilization,
    periodEmptyProbability,
    underRunningCourses,
    deptUtilization,
    computedAt: new Date().toISOString(),
  };
}

const worker = new Worker<AnalyticsJobData>(
  "analytics-recompute",
  async (job: Job<AnalyticsJobData>) => {
    const start = Date.now();
    console.log("[analytics-worker] Recomputing. trigger=" + job.data.trigger);

    try {
      const analytics = await recomputeAnalytics();
      const redis = getRedis();

      // Cache in Redis; the API reads from this cache for sub-millisecond responses
      await redis.setex(ANALYTICS_CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(analytics));

      // Publish to WebSocket subscribers (if connected via pub/sub)
      await redis.publish("samayak:analytics:updated", JSON.stringify({ ts: analytics.computedAt }));

      console.log(
        "[analytics-worker] Done in " + (Date.now() - start) + "ms. " +
        "Rooms=" + analytics.summary.totalRooms +
        " AvgUtil=" + analytics.summary.avgUtilization + "%"
      );
    } catch (err: any) {
      console.error("[analytics-worker] Recompute failed:", err.message);
      throw err;
    }
  },
  {
    connection: { createClient: () => getRedis() },
    concurrency: 1,
    // Deduplicate: if a recompute is already queued, skip adding another
    settings: { backoffStrategy: () => 2000 },
  }
);

worker.on("failed", (job, err) =>
  console.error("[analytics-worker] Job " + (job?.id ?? "?") + " failed:", err.message)
);

console.log("[analytics-worker] Listening on analytics-recompute queue");
