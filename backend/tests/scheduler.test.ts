import { describe, expect, it } from "vitest";
import { computePenalty, solveTimetable } from "../src/scheduler/engine";
import { validateAssignments } from "../src/scheduler/validator";
import type {
  SchedFaculty,
  SchedRequirement,
  SchedRoom,
  SchedulerInput,
  SchedulerResult,
} from "../src/scheduler/types";

// 5 days x 8 periods, lunch at index 4 -> teachable runs are [0..3] and [5..7]
const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const PERIODS = [
  "I", "II", "III", "IV", "LUNCH", "V", "VI", "VII",
].map((label) => ({ label, isBreak: label === "LUNCH" }));

function fac(id: string, over: Partial<SchedFaculty> = {}): SchedFaculty {
  return { id, maxPeriodsPerWeek: 20, maxConsecutive: 3, ...over };
}
function room(id: string, over: Partial<SchedRoom> = {}): SchedRoom {
  return { id, capacity: 60, type: "CLASSROOM", ...over };
}
function req(id: string, groups: string[], facultyIds: string[], over: Partial<SchedRequirement> = {}): SchedRequirement {
  return {
    id,
    subjectId: id,
    studentGroups: groups,
    strength: 50,
    facultyIds,
    sessionsPerWeek: 3,
    blockLength: 1,
    roomTypes: ["CLASSROOM"],
    ...over,
  };
}
function input(parts: Partial<SchedulerInput>): SchedulerInput {
  return { days: DAYS, periods: PERIODS, rooms: [], faculty: [], requirements: [], ...parts };
}
const strip = (r: SchedulerResult) => ({ ...r, durationMs: 0 });

describe("scheduler: feasible instances", () => {
  it("schedules multiple departments, sections, faculty and subjects with zero violations", () => {
    const faculty = Array.from({ length: 8 }, (_, i) => fac(`f${i}`));
    const rooms = [
      ...Array.from({ length: 4 }, (_, i) => room(`c${i}`)),
      room("lab1", { type: "LAB", capacity: 30 }),
      room("lab2", { type: "LAB", capacity: 30 }),
    ];
    const requirements: SchedRequirement[] = [];
    // 2 departments x 2 sections x 5 theory subjects + 1 lab each
    let fi = 0;
    for (const dept of ["CSE", "ECE"]) {
      for (const sec of ["A", "B"]) {
        const g = `${dept}-${sec}`;
        for (let s = 0; s < 5; s++) {
          requirements.push(req(`${g}-T${s}`, [g], [`f${fi % 8}`, `f${(fi + 1) % 8}`], { sessionsPerWeek: 3 }));
          fi++;
        }
        requirements.push(
          req(`${g}-LAB`, [g], [`f${fi % 8}`], { sessionsPerWeek: 1, blockLength: 3, roomTypes: ["LAB"], strength: 30 }),
        );
        fi++;
      }
    }
    const inp = input({ rooms, faculty, requirements });
    const res = solveTimetable(inp);

    expect(res.status).toBe("COMPLETE");
    expect(res.unassigned).toEqual([]);
    expect(res.hardViolations).toEqual([]);
    expect(res.assignedSessions).toBe(res.totalSessions);
    expect(validateAssignments(inp, res.assignments, { requireComplete: true })).toEqual([]);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it("fills a single room to the brim without double-booking it", () => {
    // 5 sections x 7 sessions = 35 = exactly 5 days x 7 teachable periods
    const faculty = Array.from({ length: 5 }, (_, i) => fac(`f${i}`, { maxConsecutive: 7, maxPeriodsPerWeek: 35 }));
    const requirements = Array.from({ length: 5 }, (_, i) => req(`r${i}`, [`S${i}`], [`f${i}`], { sessionsPerWeek: 7 }));
    const inp = input({ rooms: [room("only")], faculty, requirements });
    const res = solveTimetable(inp);
    expect(res.status).toBe("COMPLETE");
    expect(res.hardViolations).toEqual([]);
  });

  it("respects faculty availability and consecutive-period limits", () => {
    const f = fac("solo", {
      maxConsecutive: 2,
      unavailable: [1, 2, 3, 4].flatMap((day) => PERIODS.map((_, period) => ({ day, period }))), // only Monday
    });
    const inp = input({ rooms: [room("r")], faculty: [f], requirements: [req("x", ["S"], ["solo"], { sessionsPerWeek: 5 })] });
    const res = solveTimetable(inp);
    expect(res.status).toBe("COMPLETE");
    expect(res.assignments.every((a) => a.day === 0)).toBe(true);
    expect(res.hardViolations).toEqual([]);
  });

  it("keeps lab blocks inside one run (never across lunch) and in LAB rooms", () => {
    const requirements = ["A", "B", "C"].map((g) =>
      req(`lab-${g}`, [g], ["f1", "f2"], { sessionsPerWeek: 2, blockLength: 3, roomTypes: ["LAB"], strength: 25 }),
    );
    const inp = input({
      rooms: [room("L1", { type: "LAB", capacity: 30 }), room("L2", { type: "LAB", capacity: 30 }), room("C1")],
      faculty: [fac("f1", { maxConsecutive: 3 }), fac("f2", { maxConsecutive: 3 })],
      requirements,
    });
    const res = solveTimetable(inp);
    expect(res.status).toBe("COMPLETE");
    for (const a of res.assignments) {
      expect(a.length).toBe(3);
      const end = a.startPeriod + a.length - 1;
      expect(a.startPeriod <= 3 ? end <= 3 : a.startPeriod >= 5).toBe(true);
      expect(["L1", "L2"]).toContain(a.roomId);
    }
  });

  it("treats batches as separate groups that still clash with the whole section", () => {
    const requirements = [
      req("lecture-A", ["A:b1", "A:b2"], ["f1"], { sessionsPerWeek: 10 }),
      req("lab-A1", ["A:b1"], ["f2"], { sessionsPerWeek: 2, blockLength: 2, roomTypes: ["LAB"], strength: 20 }),
      req("lab-A2", ["A:b2"], ["f3"], { sessionsPerWeek: 2, blockLength: 2, roomTypes: ["LAB"], strength: 20 }),
    ];
    const inp = input({
      rooms: [room("C1"), room("L1", { type: "LAB", capacity: 30 }), room("L2", { type: "LAB", capacity: 30 })],
      faculty: [fac("f1", { maxConsecutive: 4 }), fac("f2"), fac("f3")],
      requirements,
    });
    const res = solveTimetable(inp);
    expect(res.status).toBe("COMPLETE");
    expect(res.hardViolations).toEqual([]);
  });

  it("is deterministic for the same input and seed", () => {
    const faculty = Array.from({ length: 4 }, (_, i) => fac(`f${i}`));
    const requirements = Array.from({ length: 6 }, (_, i) => req(`r${i}`, [`S${i % 3}`], [`f${i % 4}`, `f${(i + 1) % 4}`], { sessionsPerWeek: 4 }));
    const inp = input({ rooms: [room("a"), room("b")], faculty, requirements, config: { seed: 42 } });
    expect(strip(solveTimetable(inp))).toEqual(strip(solveTimetable(inp)));
  });
});

describe("scheduler: impossible instances are never reported as complete", () => {
  it("reports room overload with proof, unassigned sessions and reasons", () => {
    // 4 sections x 10 sessions = 40 room-periods, one room offers 35
    const faculty = Array.from({ length: 4 }, (_, i) => fac(`f${i}`, { maxConsecutive: 7, maxPeriodsPerWeek: 35 }));
    const requirements = Array.from({ length: 4 }, (_, i) => req(`r${i}`, [`S${i}`], [`f${i}`], { sessionsPerWeek: 10 }));
    const res = solveTimetable(input({ rooms: [room("only")], faculty, requirements }));

    expect(res.status).toBe("INFEASIBLE");
    expect(res.infeasibilityProofs.some((p) => p.kind === "ROOM_TYPE_OVERLOAD")).toBe(true);
    expect(res.hardViolations).toEqual([]);
    expect(res.assignedSessions).toBeLessThanOrEqual(35);
    expect(res.unassigned.length).toBe(res.totalSessions - res.assignedSessions);
    expect(res.unassigned.length).toBeGreaterThanOrEqual(5);
    for (const u of res.unassigned) expect(u.reasons.length).toBeGreaterThan(0);
  });

  it("reports a single faculty member who cannot cover the load", () => {
    const inp = input({
      rooms: [room("a"), room("b")],
      faculty: [fac("only", { maxPeriodsPerWeek: 6 })],
      requirements: [req("x", ["S"], ["only"], { sessionsPerWeek: 10 })],
    });
    const res = solveTimetable(inp);
    expect(res.status).toBe("INFEASIBLE");
    expect(res.infeasibilityProofs.some((p) => p.kind === "FACULTY_OVERLOAD")).toBe(true);
    expect(res.assignedSessions).toBe(6);
    expect(res.unassigned).toHaveLength(4);
  });

  it("explains a lab requirement with no lab room", () => {
    const inp = input({
      rooms: [room("c1")],
      faculty: [fac("f")],
      requirements: [req("lab", ["S"], ["f"], { roomTypes: ["LAB"], blockLength: 2, sessionsPerWeek: 1 })],
    });
    const res = solveTimetable(inp);
    expect(res.status).toBe("INFEASIBLE");
    expect(res.assignedSessions).toBe(0);
    expect(res.unassigned[0].reasons.join(" ")).toMatch(/LAB room/);
  });

  it("explains capacity shortfalls and missing faculty", () => {
    const inp = input({
      rooms: [room("small", { capacity: 20 })],
      faculty: [fac("f")],
      requirements: [
        req("big", ["S1"], ["f"], { strength: 90, sessionsPerWeek: 1 }),
        req("nobody", ["S2"], [], { sessionsPerWeek: 1 }),
      ],
    });
    const res = solveTimetable(inp);
    expect(res.status).toBe("INFEASIBLE");
    const reasons = Object.fromEntries(res.unassigned.map((u) => [u.requirementId, u.reasons.join(" ")]));
    expect(reasons.big).toMatch(/capacity >= 90/);
    expect(reasons.nobody).toMatch(/No faculty/);
  });

  it("still schedules everything that CAN be scheduled around an unplaceable session", () => {
    const inp = input({
      rooms: [room("a")],
      faculty: [fac("f"), fac("g")],
      requirements: [
        req("ok", ["S1"], ["f"], { sessionsPerWeek: 5 }),
        req("lab", ["S2"], ["g"], { roomTypes: ["LAB"], sessionsPerWeek: 1 }),
      ],
    });
    const res = solveTimetable(inp);
    expect(res.assignedSessions).toBe(5);
    expect(res.unassigned).toHaveLength(1);
    expect(res.status).not.toBe("COMPLETE");
  });

  it("detects a section that needs more periods than the week has", () => {
    const inp = input({
      rooms: [room("a"), room("b"), room("c")],
      faculty: Array.from({ length: 4 }, (_, i) => fac(`f${i}`, { maxConsecutive: 7, maxPeriodsPerWeek: 35 })),
      requirements: Array.from({ length: 4 }, (_, i) => req(`r${i}`, ["SAME"], [`f${i}`], { sessionsPerWeek: 10 })),
    });
    const res = solveTimetable(inp);
    expect(res.infeasibilityProofs.some((p) => p.kind === "GROUP_OVERLOAD")).toBe(true);
    expect(res.status).toBe("INFEASIBLE");
    expect(res.assignedSessions).toBeLessThanOrEqual(35);
    expect(res.hardViolations).toEqual([]);
  });
});

describe("validator: independently catches injected violations", () => {
  const base = () => {
    const inp = input({
      rooms: [room("r1"), room("r2"), room("lab", { type: "LAB", capacity: 30 })],
      faculty: [fac("f1"), fac("f2")],
      requirements: [
        req("a", ["A"], ["f1"], { sessionsPerWeek: 2 }),
        req("b", ["B"], ["f2"], { sessionsPerWeek: 2 }),
      ],
    });
    return { inp, res: solveTimetable(inp) };
  };

  it("passes a clean timetable", () => {
    const { inp, res } = base();
    expect(validateAssignments(inp, res.assignments, { requireComplete: true })).toEqual([]);
  });

  const mutate = (fn: (a: any[]) => void) => {
    const { inp, res } = base();
    const as = res.assignments.map((x) => ({ ...x }));
    fn(as);
    return validateAssignments(inp, as, { requireComplete: true }).map((v) => v.type);
  };

  it("room double-booking", () => {
    expect(mutate((as) => { Object.assign(as[1], { day: as[0].day, startPeriod: as[0].startPeriod, roomId: as[0].roomId }); })).toContain("ROOM_CONFLICT");
  });
  it("faculty double-booking", () => {
    expect(mutate((as) => { Object.assign(as[2], { facultyId: as[0].facultyId, day: as[0].day, startPeriod: as[0].startPeriod }); })).toContain("FACULTY_CONFLICT");
  });
  it("section double-booking", () => {
    expect(mutate((as) => { Object.assign(as[1], { day: as[0].day, startPeriod: as[0].startPeriod }); })).toContain("GROUP_CONFLICT");
  });
  it("class during lunch", () => {
    expect(mutate((as) => { as[0].startPeriod = 4; })).toContain("BREAK_PERIOD_USED");
  });
  it("unqualified faculty", () => {
    expect(mutate((as) => { as[0].facultyId = "f2"; })).toContain("FACULTY_NOT_QUALIFIED");
  });
  it("wrong room type", () => {
    expect(mutate((as) => { as[0].roomId = "lab"; })).toContain("ROOM_TYPE_MISMATCH");
  });
  it("capacity too small", () => {
    expect(mutate((as) => { as[0].roomId = "lab"; })).toContain("ROOM_CAPACITY");
  });
  it("missing sessions when completeness is required", () => {
    expect(mutate((as) => { as.pop(); })).toContain("SESSION_COUNT_UNMET");
  });
  it("faculty unavailability", () => {
    const inp = input({
      rooms: [room("r")],
      faculty: [fac("f", { unavailable: [{ day: 0, period: 0 }] })],
      requirements: [req("a", ["A"], ["f"], { sessionsPerWeek: 1 })],
    });
    const v = validateAssignments(inp, [{ requirementId: "a", sessionIndex: 0, facultyId: "f", roomId: "r", day: 0, startPeriod: 0, length: 1 }]);
    expect(v.map((x) => x.type)).toContain("FACULTY_UNAVAILABLE");
  });
  it("faculty consecutive and weekly caps", () => {
    const inp = input({
      rooms: [room("r1"), room("r2"), room("r3")],
      faculty: [fac("f", { maxConsecutive: 2, maxPeriodsPerWeek: 2 })],
      requirements: [
        req("a", ["A"], ["f"], { sessionsPerWeek: 1 }),
        req("b", ["B"], ["f"], { sessionsPerWeek: 1 }),
        req("c", ["C"], ["f"], { sessionsPerWeek: 1 }),
      ],
    });
    const mk = (id: string, room: string, p: number) => ({ requirementId: id, sessionIndex: 0, facultyId: "f", roomId: room, day: 0, startPeriod: p, length: 1 });
    const types = validateAssignments(inp, [mk("a", "r1", 0), mk("b", "r2", 1), mk("c", "r3", 2)]).map((v) => v.type);
    expect(types).toContain("FACULTY_MAX_CONSECUTIVE");
    expect(types).toContain("FACULTY_MAX_PERIODS");
  });
});

// ── randomised property tests ────────────────────────────────────────────────

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function randomInstance(seed: number): SchedulerInput {
  const rnd = lcg(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const nFac = 4 + pick(6);
  const nRoom = 2 + pick(4);
  const nGroups = 2 + pick(5);
  const faculty: SchedFaculty[] = Array.from({ length: nFac }, (_, i) => {
    const unavailable = [];
    for (let k = 0; k < pick(6); k++) unavailable.push({ day: pick(5), period: pick(8) });
    const preferred = rnd() < 0.3 ? [{ day: pick(5), period: pick(8) }, { day: pick(5), period: pick(8) }] : undefined;
    return fac(`f${i}`, { maxConsecutive: 2 + pick(3), maxPeriodsPerWeek: 10 + pick(20), unavailable, preferred });
  });
  const rooms: SchedRoom[] = Array.from({ length: nRoom }, (_, i) =>
    room(`r${i}`, { type: i === 0 ? "LAB" : "CLASSROOM", capacity: 20 + pick(60) }),
  );
  const requirements: SchedRequirement[] = [];
  for (let g = 0; g < nGroups; g++) {
    const subjects = 3 + pick(4);
    for (let s = 0; s < subjects; s++) {
      const isLab = rnd() < 0.2;
      const cands = [...new Set([pick(nFac), pick(nFac)])].map((i) => `f${i}`);
      requirements.push(
        req(`g${g}s${s}`, [`G${g}`], cands, {
          strength: 15 + pick(40),
          sessionsPerWeek: isLab ? 1 : 1 + pick(4),
          blockLength: isLab ? 2 : 1,
          roomTypes: isLab ? ["LAB"] : ["CLASSROOM"],
        }),
      );
    }
  }
  return input({ rooms, faculty, requirements, config: { seed, maxBacktracks: 1500, restarts: 1, timeLimitMs: 4000 } });
}

describe("scheduler: randomised properties", () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

  it("never emits a hard violation, never mislabels, and keeps accounting consistent", () => {
    let complete = 0;
    for (const seed of seeds) {
      const inp = randomInstance(seed);
      const res = solveTimetable(inp);

      // independent re-validation
      expect(validateAssignments(inp, res.assignments), `seed ${seed}`).toEqual([]);
      expect(res.hardViolations, `seed ${seed}`).toEqual([]);

      // accounting
      expect(res.assignedSessions + res.unassigned.length, `seed ${seed}`).toBe(res.totalSessions);
      if (res.status === "COMPLETE") {
        complete++;
        expect(validateAssignments(inp, res.assignments, { requireComplete: true }), `seed ${seed}`).toEqual([]);
        expect(res.unassigned).toEqual([]);
      } else {
        expect(res.unassigned.length, `seed ${seed}`).toBeGreaterThan(0);
        expect(["PARTIAL", "INFEASIBLE"]).toContain(res.status);
      }
      expect(res.status).not.toBe("INVALID");

      // reported penalty equals a from-scratch recomputation
      expect(res.penalties.total, `seed ${seed}`).toBeCloseTo(computePenalty(inp, res.assignments).total, 2);
    }
    // sanity: the generator must produce a healthy mix, otherwise the test proves little
    expect(complete).toBeGreaterThan(5);
    expect(complete).toBeLessThan(seeds.length);
  });

  it("local search never makes the soft penalty worse", () => {
    for (const seed of seeds.slice(0, 15)) {
      const inp = randomInstance(seed);
      const without = solveTimetable({ ...inp, config: { ...inp.config, localSearchPasses: 0 } });
      const withLs = solveTimetable(inp);
      if (without.assignedSessions !== withLs.assignedSessions) continue; // different search outcome; not comparable
      expect(withLs.penalties.total, `seed ${seed}`).toBeLessThanOrEqual(without.penalties.total + 1e-6);
    }
  });
});

describe("scheduler: equipment allow-list and progress hook", () => {
  it("only uses allowed rooms and reports when none qualifies", () => {
    const rooms = [room("plain"), room("projector"), room("projector2")];
    const faculty = [fac("f")];
    const r1 = req("x", ["S"], ["f"], { sessionsPerWeek: 4, allowedRoomIds: ["projector", "projector2"] });
    const res = solveTimetable(input({ rooms, faculty, requirements: [r1] }));
    expect(res.status).toBe("COMPLETE");
    expect(res.assignments.every((a) => a.roomId !== "plain")).toBe(true);

    const bad = solveTimetable(input({ rooms, faculty, requirements: [{ ...r1, allowedRoomIds: ["missing"] }] }));
    expect(bad.status).toBe("INFEASIBLE");
    expect(bad.unassigned[0].reasons.join(" ")).toMatch(/required equipment/);

    // the independent validator also rejects an assignment into a non-allowed room
    const v = validateAssignments(input({ rooms, faculty, requirements: [r1] }), [
      { requirementId: "x", sessionIndex: 0, facultyId: "f", roomId: "plain", day: 0, startPeriod: 0, length: 1 },
    ]);
    expect(v.map((x) => x.type)).toContain("ROOM_TYPE_MISMATCH");
  });

  it("calls onProgress and does not change the result", () => {
    const faculty = Array.from({ length: 6 }, (_, i) => fac(`f${i}`));
    const requirements = Array.from({ length: 10 }, (_, i) => req(`r${i}`, [`S${i % 5}`], [`f${i % 6}`], { sessionsPerWeek: 4 }));
    const inp = input({ rooms: [room("a"), room("b"), room("c")], faculty, requirements });
    const events: string[] = [];
    const withHook = solveTimetable(inp, { onProgress: (p) => events.push(p.phase) });
    expect(events).toContain("local-search");
    expect(strip(withHook)).toEqual(strip(solveTimetable(inp)));
  });

  it("partial completeness: only the listed requirements must be complete", () => {
    const inp = input({ rooms: [room("r1"), room("r2")], faculty: [fac("f1"), fac("f2")], requirements: [req("a", ["A"], ["f1"], { sessionsPerWeek: 2 }), req("b", ["B"], ["f2"], { sessionsPerWeek: 2 })] });
    const res = solveTimetable(inp);
    const onlyA = res.assignments.filter((a) => a.requirementId === "a");
    expect(validateAssignments(inp, onlyA, { requireComplete: new Set(["a"]) })).toEqual([]);
    expect(validateAssignments(inp, onlyA, { requireComplete: true }).map((v) => v.requirementId)).toContain("b");
  });
});
