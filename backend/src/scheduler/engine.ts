/**
 * Constraint-based timetable engine.
 *
 * Model
 *   Variable : one weekly session of a requirement (a block of L consecutive periods).
 *   Value    : (day, startPeriod, faculty, room).
 *   Hard     : faculty/room/student-group never double-booked; faculty qualified,
 *              available, within weekly + consecutive caps; room type + capacity;
 *              blocks never cross a break or leave the day.
 *   Soft     : student/faculty idle gaps, same subject twice a day, long streaks,
 *              faculty preferences, wasted room capacity, uneven faculty load.
 *
 * Search
 *   1. Backtracking with Minimum-Remaining-Values variable ordering, degree and
 *      block-length tie-breaks, and forward checking (neighbour domains are
 *      re-filtered after every placement; an empty domain triggers backtrack).
 *   2. Value ordering by incremental soft cost, limited to `branchLimit`
 *      (position, faculty, room) tuples per variable.
 *   3. Attempt 0 is fully deterministic. Further restarts add seeded jitter.
 *      The primary stopping rule is a backtrack budget, so results are
 *      reproducible; the wall-clock limit is only a safety net.
 *   4. If no attempt completes, the best partial placement is kept and the
 *      remaining sessions are greedily placed (no backtracking) where possible.
 *   5. Hill-climbing local search relocates single sessions while strictly
 *      lowering the soft penalty. Hard constraints are never relaxed.
 *
 * Every result passes through the independent validator before it is labelled.
 */
import {
  DEFAULT_WEIGHTS,
  type Assignment,
  type InfeasibilityProof,
  type PenaltyBreakdown,
  type SchedulerConfig,
  type SchedulerInput,
  type SchedulerResult,
  type SoftWeights,
  type UnassignedSession,
} from "./types";
import { validateAssignments } from "./validator";

interface Session {
  idx: number;
  reqIdx: number;
  sessionIndex: number;
  L: number;
  groups: number[]; // group indices
  facultyCands: number[]; // faculty indices
  roomCands: number[]; // room indices (type + capacity already applied)
  strength: number;
  staticPositions: number[]; // d*P+p where the block fits without crossing a break
}

interface Placement {
  pos: number; // d*P + p
  f: number;
  r: number;
}

class SeededRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function scoreFromPenalty(total: number, sessions: number): number {
  if (sessions === 0) return 100;
  // 10 penalty points per session is treated as "worst reasonable" => score 0.
  return Math.max(0, Math.round((100 - (100 * total) / (sessions * 10)) * 10) / 10);
}

export function solveTimetable(input: SchedulerInput): SchedulerResult {
  const t0 = Date.now();
  const cfg = input.config ?? {};
  const weights: SoftWeights = { ...DEFAULT_WEIGHTS, ...(cfg.weights ?? {}) };
  const timeLimitMs = cfg.timeLimitMs ?? 20_000;
  const maxBacktracks = cfg.maxBacktracks ?? 20_000;
  const restarts = cfg.restarts ?? 2;
  const branchLimit = cfg.branchLimit ?? 48;
  const lsPasses = cfg.localSearchPasses ?? 6;
  const maxStreak = cfg.maxStudentStreak ?? 3;
  const baseSeed = cfg.seed ?? 1;

  assertInput(input);

  const D = input.days.length;
  const P = input.periods.length;
  const CELLS = D * P;

  // ── index maps ────────────────────────────────────────────────────────────
  const fIdx = new Map(input.faculty.map((f, i) => [f.id, i]));
  const rIdx = new Map(input.rooms.map((r, i) => [r.id, i]));
  const groupIds: string[] = [];
  const gIdx = new Map<string, number>();
  for (const req of input.requirements)
    for (const g of req.studentGroups)
      if (!gIdx.has(g)) {
        gIdx.set(g, groupIds.length);
        groupIds.push(g);
      }
  const F = input.faculty.length;
  const R = input.rooms.length;
  const G = groupIds.length;

  const fUnavail = input.faculty.map((f) => cellMask(f.unavailable, P, CELLS));
  const fPreferred = input.faculty.map((f) => cellMask(f.preferred, P, CELLS));
  const fHasPref = input.faculty.map((f) => (f.preferred?.length ?? 0) > 0);
  const rUnavail = input.rooms.map((r) => cellMask(r.unavailable, P, CELLS));

  // ── sessions ──────────────────────────────────────────────────────────────
  const sessions: Session[] = [];
  const blockStartsCache = new Map<number, number[]>();
  const blockStarts = (L: number): number[] => {
    let v = blockStartsCache.get(L);
    if (v) return v;
    v = [];
    for (let d = 0; d < D; d++)
      for (let p = 0; p + L <= P; p++) {
        let ok = true;
        for (let k = 0; k < L; k++)
          if (input.periods[p + k].isBreak) {
            ok = false;
            break;
          }
        if (ok) v.push(d * P + p);
      }
    blockStartsCache.set(L, v);
    return v;
  };

  input.requirements.forEach((req, reqIdx) => {
    const facultyCands = req.facultyIds.map((id) => fIdx.get(id)).filter((x): x is number => x !== undefined);
    const roomCands: number[] = [];
    input.rooms.forEach((room, ri) => {
      if (req.roomTypes.includes(room.type) && room.capacity >= req.strength) roomCands.push(ri);
    });
    for (let k = 0; k < req.sessionsPerWeek; k++) {
      sessions.push({
        idx: sessions.length,
        reqIdx,
        sessionIndex: k,
        L: req.blockLength,
        groups: req.studentGroups.map((g) => gIdx.get(g)!),
        facultyCands,
        roomCands,
        strength: req.strength,
        staticPositions: blockStarts(req.blockLength),
      });
    }
  });
  const N = sessions.length;

  // Static neighbour graph: sessions that can influence each other's domains.
  const neighbours: number[][] = sessions.map(() => []);
  {
    const gSet = sessions.map((s) => new Set(s.groups));
    const fSet = sessions.map((s) => new Set(s.facultyCands));
    const rSet = sessions.map((s) => new Set(s.roomCands));
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        if (
          s_overlap(gSet[i], gSet[j]) ||
          s_overlap(fSet[i], fSet[j]) ||
          s_overlap(rSet[i], rSet[j])
        ) {
          neighbours[i].push(j);
          neighbours[j].push(i);
        }
      }
  }

  // ── mutable state ─────────────────────────────────────────────────────────
  const fBusy = Array.from({ length: F }, () => new Uint8Array(CELLS));
  const rBusy = Array.from({ length: R }, () => new Uint8Array(CELLS));
  const gBusy = Array.from({ length: G }, () => new Uint8Array(CELLS));
  const fLoad = new Int32Array(F);
  const reqDayCount = new Int32Array(input.requirements.length * D);
  const placed: (Placement | null)[] = new Array(N).fill(null);
  let placedCount = 0;

  const dayOf = (pos: number) => Math.floor(pos / P);

  function facultyOk(s: Session, pos: number, f: number): boolean {
    const L = s.L;
    if (fLoad[f] + L > input.faculty[f].maxPeriodsPerWeek) return false;
    const busy = fBusy[f];
    const un = fUnavail[f];
    for (let k = 0; k < L; k++) if (busy[pos + k] || un[pos + k]) return false;
    // consecutive-run cap: extend left/right inside the same day
    const d0 = dayOf(pos) * P;
    let run = L;
    for (let c = pos - 1; c >= d0 && busy[c]; c--) run++;
    for (let c = pos + L; c < d0 + P && busy[c]; c++) run++;
    return run <= input.faculty[f].maxConsecutive;
  }
  function roomOk(s: Session, pos: number, r: number): boolean {
    const busy = rBusy[r];
    const un = rUnavail[r];
    for (let k = 0; k < s.L; k++) if (busy[pos + k] || un[pos + k]) return false;
    return true;
  }
  function groupsOk(s: Session, pos: number): boolean {
    for (const g of s.groups) {
      const busy = gBusy[g];
      for (let k = 0; k < s.L; k++) if (busy[pos + k]) return false;
    }
    return true;
  }
  function hasOption(s: Session, pos: number): boolean {
    if (!groupsOk(s, pos)) return false;
    let fOk = false;
    for (const f of s.facultyCands)
      if (facultyOk(s, pos, f)) {
        fOk = true;
        break;
      }
    if (!fOk) return false;
    for (const r of s.roomCands) if (roomOk(s, pos, r)) return true;
    return false;
  }

  function place(s: Session, pl: Placement): void {
    for (let k = 0; k < s.L; k++) {
      fBusy[pl.f][pl.pos + k] = 1;
      rBusy[pl.r][pl.pos + k] = 1;
      for (const g of s.groups) gBusy[g][pl.pos + k] = 1;
    }
    fLoad[pl.f] += s.L;
    reqDayCount[s.reqIdx * D + dayOf(pl.pos)]++;
    placed[s.idx] = pl;
    placedCount++;
  }
  function unplace(s: Session): void {
    const pl = placed[s.idx]!;
    for (let k = 0; k < s.L; k++) {
      fBusy[pl.f][pl.pos + k] = 0;
      rBusy[pl.r][pl.pos + k] = 0;
      for (const g of s.groups) gBusy[g][pl.pos + k] = 0;
    }
    fLoad[pl.f] -= s.L;
    reqDayCount[s.reqIdx * D + dayOf(pl.pos)]--;
    placed[s.idx] = null;
    placedCount--;
  }

  // ── soft cost helpers ─────────────────────────────────────────────────────
  /** idle cells between first and last busy cell of a day row, with an optional hypothetical block. */
  function rowGap(arr: Uint8Array, d: number, addP = -1, addL = 0): number {
    let first = -1,
      last = -1,
      cnt = 0;
    const base = d * P;
    for (let c = 0; c < P; c++) {
      const b = arr[base + c] || (addP >= 0 && c >= addP && c < addP + addL) ? 1 : 0;
      if (b) {
        if (first < 0) first = c;
        last = c;
        cnt++;
      }
    }
    return cnt === 0 ? 0 : last - first + 1 - cnt;
  }
  function rowStreakExcess(arr: Uint8Array, d: number, p: number, L: number): number {
    const base = d * P;
    let run = L;
    for (let c = p - 1; c >= 0 && arr[base + c]; c--) run++;
    for (let c = p + L; c < P && arr[base + c]; c++) run++;
    return Math.max(0, run - maxStreak);
  }

  /** Cost of placing s at (pos,f,r) given current state (s itself must NOT be placed). */
  function placementCost(s: Session, pos: number, f: number, r: number): number {
    const d = dayOf(pos);
    const p = pos - d * P;
    let c = 0;
    for (const g of s.groups) {
      c += weights.studentGap * (rowGap(gBusy[g], d, p, s.L) - rowGap(gBusy[g], d));
      c += weights.streak * rowStreakExcess(gBusy[g], d, p, s.L);
    }
    c += weights.facultyGap * (rowGap(fBusy[f], d, p, s.L) - rowGap(fBusy[f], d));
    if (reqDayCount[s.reqIdx * D + d] > 0) c += weights.subjectSameDay;
    if (fHasPref[f]) for (let k = 0; k < s.L; k++) if (!fPreferred[f][pos + k]) c += weights.preferred;
    const cap = input.rooms[r].capacity;
    if (cap > 0) c += weights.roomWaste * ((cap - s.strength) / cap);
    return c;
  }

  // ── candidate generation ──────────────────────────────────────────────────
  function candidates(s: Session, dom: number[], limit: number, rng: SeededRng | null): Placement[] {
    const scored: { pos: number; cost: number }[] = [];
    for (const pos of dom) {
      // cost with best faculty/room just to order positions
      let best = Infinity;
      let bf = -1,
        br = -1;
      for (const f of s.facultyCands) if (facultyOk(s, pos, f)) {
        bf = f;
        break;
      }
      for (const r of s.roomCands) if (roomOk(s, pos, r)) {
        br = r;
        break;
      }
      if (bf < 0 || br < 0 || !groupsOk(s, pos)) continue;
      best = placementCost(s, pos, bf, br);
      if (rng) best += rng.next() * 2;
      scored.push({ pos, cost: best });
    }
    scored.sort((a, b) => a.cost - b.cost || a.pos - b.pos);

    const out: Placement[] = [];
    for (const { pos } of scored) {
      const fs = s.facultyCands
        .filter((f) => facultyOk(s, pos, f))
        .map((f) => ({ f, c: fLoad[f] * weights.loadBalance + (fHasPref[f] ? placementPrefCost(s, pos, f) : 0) }))
        .sort((a, b) => a.c - b.c || a.f - b.f)
        .slice(0, 3);
      const rs = s.roomCands
        .filter((r) => roomOk(s, pos, r))
        .sort((a, b) => input.rooms[a].capacity - input.rooms[b].capacity || a - b)
        .slice(0, 3);
      for (const { f } of fs) for (const r of rs) {
        out.push({ pos, f, r });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
  function placementPrefCost(s: Session, pos: number, f: number): number {
    let c = 0;
    for (let k = 0; k < s.L; k++) if (!fPreferred[f][pos + k]) c += weights.preferred;
    return c;
  }

  // ── search ────────────────────────────────────────────────────────────────
  const dom: number[][] = sessions.map((s) => s.staticPositions);
  /** Sessions with no viable value even on an empty timetable; excluded so they cannot stall the search. */
  const excluded: boolean[] = new Array(N).fill(false);
  let target = N;
  let nodes = 0;
  let backtracks = 0;
  let stoppedBy: SchedulerResult["stats"]["stoppedBy"] = "complete";
  let best: { count: number; placements: (Placement | null)[] } = { count: -1, placements: [] };

  function snapshotIfBest() {
    if (placedCount > best.count) best = { count: placedCount, placements: placed.map((p) => (p ? { ...p } : null)) };
  }

  function selectVariable(): Session | null {
    let pick: Session | null = null;
    for (const s of sessions) {
      if (placed[s.idx] || excluded[s.idx]) continue;
      if (!pick) {
        pick = s;
        continue;
      }
      const a = dom[s.idx].length,
        b = dom[pick.idx].length;
      if (a !== b) {
        if (a < b) pick = s;
        continue;
      }
      if (s.L !== pick.L) {
        if (s.L > pick.L) pick = s;
        continue;
      }
      const fa = s.facultyCands.length,
        fb = pick.facultyCands.length;
      if (fa !== fb) {
        if (fa < fb) pick = s;
        continue;
      }
      // degree heuristic: more unplaced neighbours first
      const da = neighbours[s.idx].reduce((n, j) => n + (placed[j] ? 0 : 1), 0);
      const db = neighbours[pick.idx].reduce((n, j) => n + (placed[j] ? 0 : 1), 0);
      if (da > db) pick = s;
    }
    return pick;
  }

  /** Re-filter neighbour domains. Returns false on wipe-out. Pushes undo records on `trail`. */
  function forwardCheck(s: Session, trail: { idx: number; old: number[] }[]): boolean {
    for (const j of neighbours[s.idx]) {
      if (placed[j] || excluded[j]) continue;
      const sj = sessions[j];
      const old = dom[j];
      const next = old.filter((pos) => hasOption(sj, pos));
      if (next.length !== old.length) {
        trail.push({ idx: j, old });
        dom[j] = next;
      }
      if (next.length === 0) return false;
    }
    return true;
  }

  function dfs(deadline: number, btBudget: number, btStart: number, rng: SeededRng | null): boolean {
    if (placedCount >= target) return true;
    nodes++;
    if ((nodes & 63) === 0 && Date.now() > deadline) {
      stoppedBy = "time-limit";
      return false;
    }
    if (backtracks - btStart > btBudget) {
      stoppedBy = "backtrack-budget";
      return false;
    }
    const s = selectVariable();
    if (!s) return true;
    for (const cand of candidates(s, dom[s.idx], branchLimit, rng)) {
      place(s, cand);
      snapshotIfBest();
      const trail: { idx: number; old: number[] }[] = [];
      if (forwardCheck(s, trail) && dfs(deadline, btBudget, btStart, rng)) return true;
      for (let i = trail.length - 1; i >= 0; i--) dom[trail[i].idx] = trail[i].old;
      unplace(s);
      if (stoppedBy !== "complete") return false;
      backtracks++;
    }
    return false;
  }

  function resetState() {
    for (let i = 0; i < N; i++) if (placed[i]) unplace(sessions[i]);
    for (let i = 0; i < N; i++) dom[i] = sessions[i].staticPositions;
    stoppedBy = "complete";
  }

  const deadline = t0 + timeLimitMs;
  let attempts = 0;
  let solved = false;

  // Root-level arc filtering so MRV starts from realistic domains.
  const rootFilter = () => {
    for (const s of sessions) dom[s.idx] = s.staticPositions.filter((pos) => hasOption(s, pos));
  };

  for (let a = 0; a <= restarts && !solved; a++) {
    attempts++;
    resetState();
    rootFilter();
    target = N;
    for (const s of sessions) {
      excluded[s.idx] = dom[s.idx].length === 0;
      if (excluded[s.idx]) target--;
    }
    const rng = a === 0 ? null : new SeededRng(baseSeed * 7919 + a);
    solved = dfs(deadline, maxBacktracks, backtracks, rng);
    if (Date.now() > deadline) {
      stoppedBy = solved ? "complete" : "time-limit";
      break;
    }
  }

  if (!solved) {
    // Rebuild the best partial, then greedily extend it without backtracking.
    resetState();
    if (best.count > 0) {
      for (const [i, pl] of best.placements.entries()) if (pl) place(sessions[i], pl);
    }
    greedyComplete();
    if (stoppedBy === "complete") stoppedBy = "backtrack-budget";
  } else {
    stoppedBy = "complete";
  }

  function greedyComplete() {
    // Place the most constrained remaining sessions first; skip those that cannot be placed.
    const remaining = sessions
      .filter((s) => !placed[s.idx])
      .map((s) => ({ s, n: s.staticPositions.filter((pos) => hasOption(s, pos)).length }))
      .sort((a, b) => a.n - b.n || b.s.L - a.s.L || a.s.idx - b.s.idx);
    for (const { s } of remaining) {
      const live = s.staticPositions.filter((pos) => hasOption(s, pos));
      const c = candidates(s, live, 1, null);
      if (c.length > 0) place(s, c[0]);
    }
  }

  // ── local search (soft-cost hill climbing; hard constraints untouched) ────
  let improvements = 0;
  if (placedCount > 0 && lsPasses > 0) {
    const active = new Set<number>();
    for (const s of sessions) for (const f of s.facultyCands) active.add(f);
    const activeCount = Math.max(1, active.size);
    let totalLoad = 0;
    for (let f = 0; f < F; f++) totalLoad += fLoad[f];
    const mean = totalLoad / activeCount;
    const loadCost = (f: number, L: number) =>
      weights.loadBalance * ((fLoad[f] + L - mean) ** 2 - (fLoad[f] - mean) ** 2);

    for (let pass = 0; pass < lsPasses && Date.now() < deadline; pass++) {
      let improved = false;
      for (const s of sessions) {
        const cur = placed[s.idx];
        if (!cur) continue;
        unplace(s);
        const curCost = placementCost(s, cur.pos, cur.f, cur.r) + loadCost(cur.f, s.L);
        let bestPl: Placement = cur;
        let bestCost = curCost;
        for (const pos of s.staticPositions) {
          if (!groupsOk(s, pos)) continue;
          const fs = s.facultyCands.filter((f) => facultyOk(s, pos, f));
          if (fs.length === 0) continue;
          // cheapest room is the best-fit room; evaluate one per capacity class
          const rs = s.roomCands.filter((r) => roomOk(s, pos, r));
          for (const f of fs)
            for (const r of rs) {
              const c = placementCost(s, pos, f, r) + loadCost(f, s.L);
              if (c < bestCost - 1e-9) {
                bestCost = c;
                bestPl = { pos, f, r };
              }
            }
        }
        place(s, bestPl);
        if (bestPl !== cur) {
          improvements++;
          improved = true;
        }
      }
      if (!improved) break;
    }
  }

  // ── assemble result ───────────────────────────────────────────────────────
  const assignments: Assignment[] = [];
  for (const s of sessions) {
    const pl = placed[s.idx];
    if (!pl) continue;
    const d = dayOf(pl.pos);
    assignments.push({
      requirementId: input.requirements[s.reqIdx].id,
      sessionIndex: s.sessionIndex,
      facultyId: input.faculty[pl.f].id,
      roomId: input.rooms[pl.r].id,
      day: d,
      startPeriod: pl.pos - d * P,
      length: s.L,
    });
  }

  const unassigned: UnassignedSession[] = [];
  for (const s of sessions) {
    if (placed[s.idx]) continue;
    unassigned.push({
      requirementId: input.requirements[s.reqIdx].id,
      sessionIndex: s.sessionIndex,
      reasons: diagnose(s),
    });
  }

  function diagnose(s: Session): string[] {
    const req = input.requirements[s.reqIdx];
    const why: string[] = [];
    if (req.facultyIds.length === 0) why.push("No faculty is assigned/qualified for this subject");
    else if (s.facultyCands.length === 0) why.push("None of the listed faculty exist in the faculty set");
    if (s.roomCands.length === 0)
      why.push(`No ${req.roomTypes.join("/")} room with capacity >= ${req.strength}`);
    if (s.staticPositions.length === 0)
      why.push(`A block of ${s.L} consecutive periods does not fit anywhere in the week (breaks split the day)`);
    if (why.length > 0) return why;

    // Per-cause tally over every possible start position.
    let byGroup = 0,
      byFaculty = 0,
      byRoom = 0,
      facAvail = 0;
    for (const pos of s.staticPositions) {
      if (!groupsOk(s, pos)) {
        byGroup++;
        continue;
      }
      const anyFreeByAvail = s.facultyCands.some((f) => {
        for (let k = 0; k < s.L; k++) if (fUnavail[f][pos + k]) return false;
        return true;
      });
      if (!anyFreeByAvail) {
        facAvail++;
        continue;
      }
      if (!s.facultyCands.some((f) => facultyOk(s, pos, f))) {
        byFaculty++;
        continue;
      }
      if (!s.roomCands.some((r) => roomOk(s, pos, r))) byRoom++;
    }
    const total = s.staticPositions.length;
    const parts: string[] = [];
    if (byGroup) parts.push(`${byGroup}/${total} start times clash with the section's other classes`);
    if (facAvail) parts.push(`${facAvail}/${total} start times fall outside every qualified faculty member's availability`);
    if (byFaculty) parts.push(`${byFaculty}/${total} start times are blocked by faculty bookings, weekly-load or consecutive-period limits`);
    if (byRoom) parts.push(`${byRoom}/${total} start times have no free suitable room`);
    why.push(parts.length ? "No feasible slot left: " + parts.join("; ") : "Search budget exhausted before a feasible slot was found");
    return why;
  }

  const hardViolations = validateAssignments(input, assignments);
  const penalties = computePenalty(input, assignments, weights, maxStreak);
  const proofs = preflightProofs(input);

  let status: SchedulerResult["status"];
  if (hardViolations.length > 0) status = "INVALID";
  else if (unassigned.length === 0) status = "COMPLETE";
  else if (proofs.length > 0) status = "INFEASIBLE";
  else status = "PARTIAL";

  // `solved` must agree with an empty `unassigned`; the validator is the arbiter.
  return {
    status,
    assignments,
    totalSessions: N,
    assignedSessions: assignments.length,
    unassigned,
    hardViolations,
    infeasibilityProofs: proofs,
    penalties,
    score: scoreFromPenalty(penalties.total, assignments.length),
    durationMs: Date.now() - t0,
    stats: { nodes, backtracks, attempts, localSearchImprovements: improvements, stoppedBy: unassigned.length === 0 ? "complete" : stoppedBy },
  };
}

// ─── penalty from scratch (also used by tests to cross-check local search) ───

export function computePenalty(
  input: SchedulerInput,
  assignments: Assignment[],
  w: SoftWeights = DEFAULT_WEIGHTS,
  maxStreak = 3,
): PenaltyBreakdown {
  const D = input.days.length;
  const P = input.periods.length;
  const reqById = new Map(input.requirements.map((r) => [r.id, r]));
  const facById = new Map(input.faculty.map((f) => [f.id, f]));
  const roomById = new Map(input.rooms.map((r) => [r.id, r]));

  const gRows = new Map<string, Uint8Array>();
  const fRows = new Map<string, Uint8Array>();
  const row = (m: Map<string, Uint8Array>, k: string) => {
    let r = m.get(k);
    if (!r) m.set(k, (r = new Uint8Array(D * P)));
    return r;
  };
  const reqDays = new Map<string, number[]>();
  const load = new Map<string, number>();
  let preferred = 0;
  let roomWaste = 0;

  for (const a of assignments) {
    const req = reqById.get(a.requirementId);
    const fac = facById.get(a.facultyId);
    const room = roomById.get(a.roomId);
    if (!req || !fac || !room) continue;
    for (let k = 0; k < a.length; k++) {
      const cell = a.day * P + a.startPeriod + k;
      for (const g of req.studentGroups) row(gRows, g)[cell] = 1;
      row(fRows, fac.id)[cell] = 1;
    }
    const days = reqDays.get(req.id) ?? new Array(D).fill(0);
    days[a.day]++;
    reqDays.set(req.id, days);
    load.set(fac.id, (load.get(fac.id) ?? 0) + a.length);
    if ((fac.preferred?.length ?? 0) > 0) {
      const pref = new Set(fac.preferred!.map((s) => s.day * P + s.period));
      for (let k = 0; k < a.length; k++) if (!pref.has(a.day * P + a.startPeriod + k)) preferred += w.preferred;
    }
    if (room.capacity > 0) roomWaste += w.roomWaste * ((room.capacity - req.strength) / room.capacity);
  }

  const gapAndStreak = (rows: Map<string, Uint8Array>) => {
    let gap = 0,
      streak = 0;
    for (const arr of rows.values())
      for (let d = 0; d < D; d++) {
        let first = -1,
          last = -1,
          cnt = 0,
          run = 0;
        for (let p = 0; p < P; p++) {
          if (arr[d * P + p]) {
            if (first < 0) first = p;
            last = p;
            cnt++;
            run++;
            if (run > maxStreak) streak++;
          } else run = 0;
        }
        if (cnt > 0) gap += last - first + 1 - cnt;
      }
    return { gap, streak };
  };

  const g = gapAndStreak(gRows);
  const f = gapAndStreak(fRows);

  let sameDay = 0;
  for (const days of reqDays.values()) for (const n of days) if (n > 1) sameDay += n - 1;

  const active = new Set<string>();
  for (const req of input.requirements) for (const id of req.facultyIds) if (facById.has(id)) active.add(id);
  const total = [...load.values()].reduce((a, b) => a + b, 0);
  const mean = total / Math.max(1, active.size);
  let loadVar = 0;
  for (const id of active) loadVar += ((load.get(id) ?? 0) - mean) ** 2;

  const br = {
    studentGap: w.studentGap * g.gap,
    facultyGap: w.facultyGap * f.gap,
    subjectSameDay: w.subjectSameDay * sameDay,
    streak: w.streak * g.streak,
    preferred,
    roomWaste,
    loadBalance: w.loadBalance * loadVar,
  };
  const sum = Object.values(br).reduce((a, b) => a + b, 0);
  const r2 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    studentGap: r2(br.studentGap),
    facultyGap: r2(br.facultyGap),
    subjectSameDay: r2(br.subjectSameDay),
    streak: r2(br.streak),
    preferred: r2(br.preferred),
    roomWaste: r2(br.roomWaste),
    loadBalance: r2(br.loadBalance),
    total: r2(sum),
  };
}

// ─── counting-argument infeasibility proofs ─────────────────────────────────

export function preflightProofs(input: SchedulerInput): InfeasibilityProof[] {
  const out: InfeasibilityProof[] = [];
  const D = input.days.length;
  const usablePerDay = input.periods.filter((p) => !p.isBreak).length;
  const weekCells = D * usablePerDay;
  const facById = new Map(input.faculty.map((f) => [f.id, f]));

  for (const req of input.requirements) {
    const label = req.label ?? req.id;
    if (req.facultyIds.length === 0 || !req.facultyIds.some((id) => facById.has(id)))
      out.push({ kind: "NO_FACULTY", message: `${label}: no qualified faculty available` });
    const rooms = input.rooms.filter((r) => req.roomTypes.includes(r.type) && r.capacity >= req.strength);
    if (rooms.length === 0)
      out.push({ kind: "NO_ROOM", message: `${label}: no ${req.roomTypes.join("/")} room holds ${req.strength} students` });
  }

  const groupLoad = new Map<string, number>();
  for (const req of input.requirements)
    for (const g of req.studentGroups) groupLoad.set(g, (groupLoad.get(g) ?? 0) + req.sessionsPerWeek * req.blockLength);
  for (const [g, n] of groupLoad)
    if (n > weekCells)
      out.push({ kind: "GROUP_OVERLOAD", message: `Student group ${g} needs ${n} periods/week but only ${weekCells} teachable periods exist` });

  const forced = new Map<string, number>();
  for (const req of input.requirements) {
    const live = req.facultyIds.filter((id) => facById.has(id));
    if (live.length === 1) forced.set(live[0], (forced.get(live[0]) ?? 0) + req.sessionsPerWeek * req.blockLength);
  }
  for (const [fid, n] of forced) {
    const cap = Math.min(facById.get(fid)!.maxPeriodsPerWeek, weekCells);
    if (n > cap) out.push({ kind: "FACULTY_OVERLOAD", message: `Faculty ${fid} is the only option for ${n} periods/week but can teach at most ${cap}` });
  }

  // Room-type demand for requirements restricted to a single type.
  for (const type of ["LAB", "CLASSROOM", "OTHER"] as const) {
    let demand = 0;
    for (const req of input.requirements)
      if (req.roomTypes.length === 1 && req.roomTypes[0] === type) demand += req.studentGroups.length > 0 ? req.sessionsPerWeek * req.blockLength : 0;
    const supply = input.rooms.filter((r) => r.type === type).length * weekCells;
    if (demand > supply && demand > 0)
      out.push({ kind: "ROOM_TYPE_OVERLOAD", message: `${type} rooms: ${demand} room-periods needed per week but only ${supply} exist` });
  }
  return out;
}

// ─── small utilities ────────────────────────────────────────────────────────

function s_overlap(a: Set<number>, b: Set<number>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) return true;
  return false;
}

function cellMask(list: { day: number; period: number }[] | undefined, P: number, cells: number): Uint8Array {
  const m = new Uint8Array(cells);
  for (const u of list ?? []) {
    const c = u.day * P + u.period;
    if (c >= 0 && c < cells) m[c] = 1;
  }
  return m;
}

function assertInput(input: SchedulerInput): void {
  if (input.days.length === 0) throw new Error("Scheduler input: at least one working day is required");
  if (input.periods.length === 0) throw new Error("Scheduler input: at least one period is required");
  const seen = (xs: { id: string }[], what: string) => {
    const s = new Set<string>();
    for (const x of xs) {
      if (s.has(x.id)) throw new Error(`Scheduler input: duplicate ${what} id '${x.id}'`);
      s.add(x.id);
    }
  };
  seen(input.rooms, "room");
  seen(input.faculty, "faculty");
  seen(input.requirements, "requirement");
  for (const r of input.requirements) {
    if (!Number.isInteger(r.sessionsPerWeek) || r.sessionsPerWeek < 0) throw new Error(`Requirement ${r.id}: sessionsPerWeek must be a non-negative integer`);
    if (!Number.isInteger(r.blockLength) || r.blockLength < 1) throw new Error(`Requirement ${r.id}: blockLength must be >= 1`);
    if (r.studentGroups.length === 0) throw new Error(`Requirement ${r.id}: at least one student group is required`);
    if (r.roomTypes.length === 0) throw new Error(`Requirement ${r.id}: at least one room type is required`);
  }
}
