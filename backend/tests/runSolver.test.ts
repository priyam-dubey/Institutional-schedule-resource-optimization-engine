import { describe, it, expect } from "vitest";
import { runSolver, SolveCancelled } from "../src/scheduler/runSolver";
import { solveTimetable } from "../src/scheduler/engine";
import type { SchedulerInput } from "../src/scheduler/types";

const big = (n: number): SchedulerInput => ({
  days: ["M", "T", "W", "Th", "F"],
  periods: Array.from({ length: 6 }, (_, i) => ({ label: `P${i}`, isBreak: false })),
  rooms: Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, capacity: 60, type: "CLASSROOM" as const })),
  faculty: Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, maxPeriodsPerWeek: 20, maxConsecutive: 3 })),
  requirements: Array.from({ length: n }, (_, i) => ({
    id: `q${i}`, subjectId: `s${i}`, studentGroups: [`g${i % 10}`], strength: 40,
    facultyIds: [`f${i % 8}`], sessionsPerWeek: 3, blockLength: 1, roomTypes: ["CLASSROOM" as const],
  })),
  config: { seed: 3, restarts: 0, maxBacktracks: 2000, localSearchPasses: 1 },
});

describe("runSolver (worker thread)", () => {
  it("returns the same result as the in-process solver and reports progress", async () => {
    const input = big(12);
    const seen: string[] = [];
    const run = runSolver(input, (p) => seen.push(p.phase));
    const res = await run.promise;
    const direct = solveTimetable(input);
    expect(res.assignments).toEqual(direct.assignments);
    expect(res.status).toBe(direct.status);
    expect(seen.length).toBeGreaterThan(0);
  }, 60000);

  it("can be cancelled", async () => {
    const input = big(40);
    input.config = { ...input.config, timeLimitMs: 60000, maxBacktracks: 5_000_000, restarts: 50 };
    const run = runSolver(input);
    setTimeout(() => run.cancel(), 200);
    await expect(run.promise).rejects.toBeInstanceOf(SolveCancelled);
  }, 30000);
});
