/**
 * BullMQ Worker: pdf-parse
 *
 * Extracts a grid timetable from a PDF and STAGES it for human review. Nothing is written
 * to timetable tables here: the extracted rows are stored on the ingestion job
 * (status AWAITING_REVIEW) and only committed through POST /api/ingestion/:id/commit
 * after a person has inspected/corrected them and the hard constraints validate.
 */
import { Worker, Job } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { publishEvent } from "../lib/events";
import type { PdfParseJobData } from "../lib/queues";
import { extractTimetable } from "../services/pdfExtract";
import { suggestSubjects } from "../services/ingestionService";

export async function processPdfJob(data: PdfParseJobData) {
  const { jobId, filePath } = data;
  await prisma.ingestionJob.update({ where: { id: jobId }, data: { status: "PROCESSING", progress: 10 } });
  try {
    const ex = await extractTimetable(filePath);
    await prisma.ingestionJob.update({ where: { id: jobId }, data: { progress: 70 } });
    const rows = await suggestSubjects(ex.rows, ex.meta.department);
    const unresolved = rows.filter((r) => !r.matched).length;
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: "AWAITING_REVIEW",
        progress: 100,
        totalRows: rows.length,
        matchedRows: rows.length - unresolved,
        failedRows: unresolved,
        payload: { meta: ex.meta, columns: ex.columns, rows, warnings: ex.warnings } as never,
      },
    });
    await publishEvent({ type: "ingestion.awaiting_review", jobId, rows: rows.length });
  } catch (err) {
    const msg = (err as Error).message;
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorLog: [{ reason: msg }] as never, completedAt: new Date() },
    });
    await publishEvent({ type: "ingestion.failed", jobId, error: msg });
    throw err;
  }
}

export function startPdfWorker(connection = getRedis()) {
  const w = new Worker<PdfParseJobData>("pdf-parse", async (job: Job<PdfParseJobData>) => processPdfJob(job.data), {
    connection,
    concurrency: 1,
  });
  w.on("failed", (job, err) => console.error("[pdf-worker] Job " + (job?.id ?? "?") + " failed:", err.message));
  return w;
}

if (process.env.NODE_ENV !== "test") startPdfWorker();
