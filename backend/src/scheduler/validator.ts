/**
 * Independent hard-constraint validator.
 *
 * Deliberately shares NO state or helpers with the solver: it rebuilds every
 * check from the raw input and the assignment list. The solver result is only
 * reported as COMPLETE/PARTIAL when this returns zero violations, and the
 * publish step re-runs it against whatever is stored in the database.
 */
import type { Assignment, SchedulerInput, Violation } from "./types";

export function validateAssignments(
  input: SchedulerInput,
  assignments: Assignment[],
  opts: { requireComplete?: boolean | ReadonlySet<string> } = {},
): Violation[] {
  const out: Violation[] = [];
  const D = input.days.length;
  const P = input.periods.length;

  const reqById = new Map(input.requirements.map((r) => [r.id, r]));
  const facById = new Map(input.faculty.map((f) => [f.id, f]));
  const roomById = new Map(input.rooms.map((r) => [r.id, r]));

  const unavail = (list: { day: number; period: number }[] | undefined) => {
    const s = new Set<number>();
    for (const u of list ?? []) s.add(u.day * P + u.period);
    return s;
  };

  const facBusy = new Map<string, Map<number, string>>();
  const roomBusy = new Map<string, Map<number, string>>();
  const groupBusy = new Map<string, Map<number, string>>();
  const facLoad = new Map<string, number>();
  const perReq = new Map<string, Set<number>>();

  const claim = (
    table: Map<string, Map<number, string>>,
    key: string,
    cell: number,
    who: string,
  ): string | null => {
    let row = table.get(key);
    if (!row) {
      row = new Map();
      table.set(key, row);
    }
    const prev = row.get(cell);
    if (prev !== undefined) return prev;
    row.set(cell, who);
    return null;
  };

  for (const a of assignments) {
    const tag = `${a.requirementId}#${a.sessionIndex}`;
    const req = reqById.get(a.requirementId);
    const fac = facById.get(a.facultyId);
    const room = roomById.get(a.roomId);

    if (!req || !fac || !room) {
      out.push({
        type: "UNKNOWN_REFERENCE",
        message: `Assignment ${tag} references an unknown ${!req ? "requirement" : !fac ? "faculty" : "room"}`,
        requirementId: a.requirementId,
        facultyId: a.facultyId,
        roomId: a.roomId,
      });
      continue;
    }

    // session bookkeeping
    let seen = perReq.get(req.id);
    if (!seen) {
      seen = new Set();
      perReq.set(req.id, seen);
    }
    if (seen.has(a.sessionIndex)) {
      out.push({ type: "DUPLICATE_SESSION", message: `Session ${tag} assigned more than once`, requirementId: req.id });
    }
    seen.add(a.sessionIndex);
    if (a.sessionIndex < 0 || a.sessionIndex >= req.sessionsPerWeek) {
      out.push({ type: "TOO_MANY_SESSIONS", message: `Session ${tag} exceeds sessionsPerWeek=${req.sessionsPerWeek}`, requirementId: req.id });
    }

    if (!req.facultyIds.includes(fac.id)) {
      out.push({ type: "FACULTY_NOT_QUALIFIED", message: `Faculty ${fac.id} is not qualified for ${req.id}`, requirementId: req.id, facultyId: fac.id });
    }
    if (!req.roomTypes.includes(room.type)) {
      out.push({ type: "ROOM_TYPE_MISMATCH", message: `Room ${room.id} (${room.type}) not allowed for ${req.id}`, requirementId: req.id, roomId: room.id });
    }
    if (req.allowedRoomIds && !req.allowedRoomIds.includes(room.id)) {
      out.push({ type: "ROOM_TYPE_MISMATCH", message: `Room ${room.id} lacks the equipment required by ${req.id}`, requirementId: req.id, roomId: room.id });
    }
    if (room.capacity < req.strength) {
      out.push({ type: "ROOM_CAPACITY", message: `Room ${room.id} capacity ${room.capacity} < strength ${req.strength} for ${req.id}`, requirementId: req.id, roomId: room.id });
    }

    if (a.length !== req.blockLength) {
      out.push({ type: "BLOCK_OUT_OF_RANGE", message: `Session ${tag} length ${a.length} != blockLength ${req.blockLength}`, requirementId: req.id });
    }
    if (a.day < 0 || a.day >= D || a.startPeriod < 0 || a.startPeriod + a.length > P) {
      out.push({ type: "BLOCK_OUT_OF_RANGE", message: `Session ${tag} outside the week grid`, requirementId: req.id, day: a.day, period: a.startPeriod });
      continue; // cell arithmetic below would be meaningless
    }

    const facUn = unavail(fac.unavailable);
    const roomUn = unavail(room.unavailable);

    for (let k = 0; k < a.length; k++) {
      const period = a.startPeriod + k;
      const cell = a.day * P + period;
      const at = { day: a.day, period };

      if (input.periods[period].isBreak) {
        out.push({ type: "BREAK_PERIOD_USED", message: `Session ${tag} uses break period ${input.periods[period].label}`, requirementId: req.id, ...at });
      }
      if (facUn.has(cell)) {
        out.push({ type: "FACULTY_UNAVAILABLE", message: `Faculty ${fac.id} unavailable at day ${a.day} period ${period} (${tag})`, requirementId: req.id, facultyId: fac.id, ...at });
      }
      if (roomUn.has(cell)) {
        out.push({ type: "ROOM_UNAVAILABLE", message: `Room ${room.id} unavailable at day ${a.day} period ${period} (${tag})`, requirementId: req.id, roomId: room.id, ...at });
      }

      const fPrev = claim(facBusy, fac.id, cell, tag);
      if (fPrev) out.push({ type: "FACULTY_CONFLICT", message: `Faculty ${fac.id} double-booked: ${fPrev} and ${tag}`, requirementId: req.id, facultyId: fac.id, ...at });
      const rPrev = claim(roomBusy, room.id, cell, tag);
      if (rPrev) out.push({ type: "ROOM_CONFLICT", message: `Room ${room.id} double-booked: ${rPrev} and ${tag}`, requirementId: req.id, roomId: room.id, ...at });
      for (const g of req.studentGroups) {
        const gPrev = claim(groupBusy, g, cell, tag);
        if (gPrev) out.push({ type: "GROUP_CONFLICT", message: `Student group ${g} double-booked: ${gPrev} and ${tag}`, requirementId: req.id, ...at });
      }
    }

    facLoad.set(fac.id, (facLoad.get(fac.id) ?? 0) + a.length);
  }

  // faculty weekly load and consecutive-run caps
  for (const [fid, load] of facLoad) {
    const fac = facById.get(fid)!;
    if (load > fac.maxPeriodsPerWeek) {
      out.push({ type: "FACULTY_MAX_PERIODS", message: `Faculty ${fid} has ${load} periods > max ${fac.maxPeriodsPerWeek}`, facultyId: fid });
    }
    const row = facBusy.get(fid);
    if (!row) continue;
    for (let d = 0; d < D; d++) {
      let run = 0;
      for (let p = 0; p <= P; p++) {
        if (p < P && row.has(d * P + p)) {
          run++;
          if (run > fac.maxConsecutive) {
            out.push({ type: "FACULTY_MAX_CONSECUTIVE", message: `Faculty ${fid} teaches ${run} consecutive periods on day ${d} (max ${fac.maxConsecutive})`, facultyId: fid, day: d, period: p });
            run = -Infinity; // report once per run
          }
        } else {
          run = 0;
        }
      }
    }
  }

  if (opts.requireComplete) {
    // `true` = every requirement must be complete; a Set = only those requirement ids.
    const only = opts.requireComplete === true ? null : opts.requireComplete;
    for (const req of input.requirements) {
      if (only && !only.has(req.id)) continue;
      const got = perReq.get(req.id)?.size ?? 0;
      if (got !== req.sessionsPerWeek) {
        out.push({ type: "SESSION_COUNT_UNMET", message: `Requirement ${req.id} has ${got}/${req.sessionsPerWeek} sessions`, requirementId: req.id });
      }
    }
  }

  return out;
}
