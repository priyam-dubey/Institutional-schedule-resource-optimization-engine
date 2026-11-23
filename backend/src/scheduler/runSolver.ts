/**
 * Runs the solver in a worker thread so that (a) progress can be reported while it
 * searches, (b) the BullMQ lock/heartbeat and HTTP loop never stall, and (c) a job can be
 * cancelled for real with `terminate()`.
 */
import { Worker } from "worker_threads";
import path from "path";
import type { SchedulerInput, SchedulerResult, SolveProgress } from "./types";

export class SolveCancelled extends Error {
  constructor() {
    super("Solve cancelled");
  }
}

export interface SolverRun {
  promise: Promise<SchedulerResult>;
  cancel: () => void;
}

export function runSolver(input: SchedulerInput, onProgress?: (p: SolveProgress) => void): SolverRun {
  const ts = __filename.endsWith(".ts");
  const entry = path.join(__dirname, ts ? "solveThread.ts" : "solveThread.js");
  // In dev/test the source is TypeScript: register ts-node inside the thread before loading it.
  const code = ts
    ? `require("ts-node").register({ transpileOnly: true }); require(${JSON.stringify(entry)});`
    : `require(${JSON.stringify(entry)});`;
  const worker = new Worker(code, { eval: true, workerData: { input } });
  let cancelled = false;
  const promise = new Promise<SchedulerResult>((resolve, reject) => {
    let done = false;
    worker.on("message", (m: { type: string; progress?: SolveProgress; result?: SchedulerResult }) => {
      if (m.type === "progress" && m.progress) onProgress?.(m.progress);
      else if (m.type === "result" && m.result) {
        done = true;
        resolve(m.result);
        void worker.terminate();
      }
    });
    worker.on("error", (e) => {
      done = true;
      reject(e);
    });
    worker.on("exit", (code) => {
      if (done) return;
      if (cancelled) reject(new SolveCancelled());
      else reject(new Error(`Solver thread exited unexpectedly (code ${code})`));
    });
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      void worker.terminate();
    },
  };
}
