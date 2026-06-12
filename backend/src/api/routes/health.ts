import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { getRedis } from "../../lib/redis";
import { csvImportQueue, pdfParseQueue, analyticsQueue } from "../../lib/queues";

const router = Router();

router.get("/health", async (req, res) => {
  const start = Date.now();
  const status: Record<string, unknown> = {};

  // DB check
  try {
    await prisma.$queryRaw`SELECT 1`;
    status.database = { status: "up", latency: `${Date.now() - start}ms`, provider: "postgresql" };
  } catch (e) {
    status.database = { status: "down", error: String(e) };
  }

  // Redis check
  try {
    const t = Date.now();
    await getRedis().ping();
    const mem = await getRedis().info("memory");
    const used = mem.match(/used_memory_human:(.+)/)?.[1]?.trim();
    status.redis = { status: "up", latency: `${Date.now() - t}ms`, memory: used };
  } catch (e) {
    status.redis = { status: "down", error: String(e) };
  }

  // Queue check
  try {
    const [csv, pdf, analytics] = await Promise.all([
      csvImportQueue.getJobCounts("waiting", "active", "completed", "failed"),
      pdfParseQueue.getJobCounts("waiting", "active", "completed", "failed"),
      analyticsQueue.getJobCounts("waiting", "active", "completed", "failed"),
    ]);
    status.queues = { "csv-import": csv, "pdf-parse": pdf, "analytics-recompute": analytics };
  } catch (e) {
    status.queues = { status: "down", error: String(e) };
  }

  const allUp = status.database?.status === "up" && status.redis?.status === "up";

  res.status(allUp ? 200 : 503).json({
    status: allUp ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
    services: status,
    uptime: `${Math.floor(process.uptime() / 86400)}d ${Math.floor((process.uptime() % 86400) / 3600)}h`,
  });
});

export default router;
