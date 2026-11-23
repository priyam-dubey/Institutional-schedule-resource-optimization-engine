/**
 * BullMQ worker: timetable-generation. The heavy search runs in a worker thread
 * (see scheduler/runSolver.ts); this process only coordinates, persists and reports.
 */
import { Worker } from "bullmq";
import { getRedis } from "../lib/redis";
import type { GenerationJobData } from "../lib/queues";
import { runGeneration } from "../services/generationService";

export function startGenerationWorker(connection = getRedis()) {
  const w = new Worker<GenerationJobData>(
    "timetable-generation",
    async (job) => {
      await runGeneration(job.data.generationId);
    },
    {
      connection,
      concurrency: Number(process.env.GENERATION_CONCURRENCY ?? 1),
      // the solver runs in a thread so the event loop stays free; still allow long jobs
      lockDuration: 120_000,
    },
  );
  w.on("failed", (job, err) => console.error(`[generation] job ${job?.id} failed:`, err.message));
  return w;
}

if (require.main !== module && process.env.NODE_ENV !== "test") {
  startGenerationWorker();
}
