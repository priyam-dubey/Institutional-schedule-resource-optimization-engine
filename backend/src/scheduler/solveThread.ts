/** Worker-thread entry: runs the CPU-bound solver off the main event loop. */
import { parentPort, workerData } from "worker_threads";
import { solveTimetable } from "./engine";
import type { SchedulerInput } from "./types";

if (parentPort) {
  const port = parentPort;
  const input = workerData.input as SchedulerInput;
  const result = solveTimetable(input, { onProgress: (p) => port.postMessage({ type: "progress", progress: p }) });
  port.postMessage({ type: "result", result });
}
