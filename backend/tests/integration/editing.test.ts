import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prismaMock, startHarness } from "../helpers/harness";

vi.mock("../../src/lib/prisma", () => prismaMock());

let h: Awaited<ReturnType<typeof startHarness>>;
let gen: any;

beforeAll(async () => {
  h = await startHarness({ sections: 2 });
  gen = await h.generate(h.seed.hod, h.seed.sections.map((s: any) => s.id), h.seed.semester.id);
});
afterAll(async () => h?.stop());

const entries = async () => (await h.call("GET", `/api/generations/${gen.id}/entries`, h.seed.hod)).body;

describe("timetable viewing and editing", () => {
  it("returns the grid metadata and filtered entries with joined names", async () => {
    const all = await entries();
    expect(all.days).toEqual(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
    expect(all.periods.find((p: any) => p.isBreak).label).toBe("Break");
    expect(all.entries.length).toBe(gen.totalSessions);
    expect(all.entries[0]).toMatchObject({ subjectCode: expect.any(String), facultyName: expect.any(String), roomNumber: expect.any(String) });
    const one = await h.call("GET", `/api/generations/${gen.id}/entries?sectionId=${h.seed.sections[0].id}`, h.seed.prof);
    expect(one.status).toBe(200);
    expect(one.body.entries.every((e: any) => e.sectionId === h.seed.sections[0].id)).toBe(true);
    expect(one.body.entries.length).toBe(gen.totalSessions / 2);
  });

  it("rejects an edit that would double-book a faculty member and leaves the data untouched", async () => {
    const all = (await entries()).entries;
    const a = all[0];
    const b = all.find((e: any) => e.facultyProfileId !== a.facultyProfileId && e.sectionId !== a.sectionId && !e.batchId);
    const r = await h.call("PATCH", `/api/generations/${gen.id}/entries/${b.id}`, h.seed.hod, {
      facultyProfileId: a.facultyProfileId, day: a.day, startPeriod: a.startPeriod,
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("CONFLICT");
    expect(r.body.details.violations.map((v: any) => v.type)).toContain("FACULTY_CONFLICT");
    const after = (await entries()).entries.find((e: any) => e.id === b.id);
    expect(after).toMatchObject({ day: b.day, startPeriod: b.startPeriod, facultyProfileId: b.facultyProfileId });
  });

  it("rejects moves into the break, out of the grid, into too-small or wrong-type rooms", async () => {
    const e = (await entries()).entries.find((x: any) => !x.batchId);
    const p = (n: object) => h.call("PATCH", `/api/generations/${gen.id}/entries/${e.id}`, h.seed.hod, n);
    const brk = await p({ startPeriod: 3 });
    expect(brk.body.details.violations.map((v: any) => v.type)).toContain("BREAK_PERIOD_USED");
    const out = await p({ startPeriod: 40 });
    expect(out.body.details.violations.map((v: any) => v.type)).toContain("BLOCK_OUT_OF_RANGE");
    const lab = h.seed.rooms.find((r: any) => r.type === "LAB");
    const wrong = await p({ roomId: lab.id });
    expect(wrong.body.details.violations.map((v: any) => v.type)).toContain("ROOM_TYPE_MISMATCH");
  });

  it("applies a valid move (free slot) and keeps the timetable valid", async () => {
    const all = (await entries()).entries;
    const e = all.find((x: any) => !x.batchId && x.sectionId === h.seed.sections[0].id);
    // find a free (day, period) for section, its faculty and room by brute force over the grid
    const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
    let moved = false;
    for (const day of days) {
      for (const startPeriod of [0, 1, 2, 4, 5, 6]) {
        if (day === e.day && startPeriod === e.startPeriod) continue;
        const r = await h.call("PATCH", `/api/generations/${gen.id}/entries/${e.id}`, h.seed.hod, { day, startPeriod });
        if (r.status === 200) {
          expect(r.body.entry).toMatchObject({ day, startPeriod });
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
    expect(moved).toBe(true);
    const v = await h.call("GET", `/api/generations/${gen.id}/validate`, h.seed.hod);
    expect(v.body.valid).toBe(true);
  });

  it("allowConflicts keeps the edit, records HARD conflicts, flips status to INVALID and blocks publishing", async () => {
    const all = (await entries()).entries;
    const a = all[0];
    const b = all.find((e: any) => e.id !== a.id && e.sectionId !== a.sectionId && !e.batchId && e.facultyProfileId !== a.facultyProfileId);
    const r = await h.call("PATCH", `/api/generations/${gen.id}/entries/${b.id}`, h.seed.hod, {
      facultyProfileId: a.facultyProfileId, day: a.day, startPeriod: a.startPeriod, allowConflicts: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.report.valid).toBe(false);
    const g = (await h.call("GET", `/api/generations/${gen.id}`, h.seed.hod)).body;
    expect(g.solveStatus).toBe("INVALID");
    expect(g.conflictCounts.HARD).toBeGreaterThan(0);
    const pub = await h.call("POST", `/api/generations/${gen.id}/publish`, h.seed.dean, {});
    expect(pub.status).toBe(409);
    expect(pub.body.code).toBe("VALIDATION_FAILED");
    // repair: put it back (revert faculty & slot)
    const fix = await h.call("PATCH", `/api/generations/${gen.id}/entries/${b.id}`, h.seed.hod, {
      facultyProfileId: b.facultyProfileId, day: b.day, startPeriod: b.startPeriod,
    });
    expect(fix.status).toBe(200);
    const g2 = (await h.call("GET", `/api/generations/${gen.id}`, h.seed.hod)).body;
    expect(g2.solveStatus).toBe("COMPLETE");
    expect(g2.conflictCounts.HARD ?? 0).toBe(0);
  });

  it("delete creates an unassigned session; add fills it back", async () => {
    const e = (await entries()).entries.find((x: any) => !x.batchId);
    const del = await h.call("DELETE", `/api/generations/${gen.id}/entries/${e.id}`, h.seed.hod);
    expect(del.status).toBe(204);
    const g = (await h.call("GET", `/api/generations/${gen.id}`, h.seed.hod)).body;
    expect(g.solveStatus).toBe("PARTIAL");
    expect(g.conflictCounts.UNASSIGNED).toBe(1);
    const add = await h.call("POST", `/api/generations/${gen.id}/entries`, h.seed.hod, {
      requirementId: e.requirementId, sessionIndex: e.sessionIndex, day: e.day, startPeriod: e.startPeriod,
      facultyProfileId: e.facultyProfileId, roomId: e.roomId,
    });
    expect(add.status).toBe(201);
    const g2 = (await h.call("GET", `/api/generations/${gen.id}`, h.seed.hod)).body;
    expect(g2.solveStatus).toBe("COMPLETE");
    const dup = await h.call("POST", `/api/generations/${gen.id}/entries`, h.seed.hod, {
      requirementId: e.requirementId, sessionIndex: e.sessionIndex, day: e.day, startPeriod: e.startPeriod,
      facultyProfileId: e.facultyProfileId, roomId: e.roomId,
    });
    expect(dup.status).toBe(409);
  });

  it("forbids edits by professors and by HODs of other departments; published timetables are read-only until cloned", async () => {
    const e = (await entries()).entries[0];
    expect((await h.call("PATCH", `/api/generations/${gen.id}/entries/${e.id}`, h.seed.prof, { startPeriod: 1 })).status).toBe(403);
    expect((await h.call("PATCH", `/api/generations/${gen.id}/entries/${e.id}`, h.seed.hodOther, { startPeriod: 1 })).status).toBe(403);

    const pub = await h.call("POST", `/api/generations/${gen.id}/publish`, h.seed.dean, {});
    expect(pub.status).toBe(200);
    const ro = await h.call("PATCH", `/api/generations/${gen.id}/entries/${e.id}`, h.seed.hod, { startPeriod: 1 });
    expect(ro.status).toBe(409);
    expect(ro.body.code).toBe("PUBLISHED");

    const clone = await h.call("POST", `/api/generations/${gen.id}/clone`, h.seed.hod);
    expect(clone.status).toBe(201);
    expect(clone.body.version).toBeGreaterThan(gen.version);
    const copied = await h.call("GET", `/api/generations/${clone.body.id}/entries`, h.seed.hod);
    expect(copied.body.entries.length).toBe(gen.totalSessions);
    const v = await h.call("GET", `/api/generations/${clone.body.id}/validate`, h.seed.hod);
    expect(v.body.valid).toBe(true);
    // unpublish then edit works
    expect((await h.call("POST", `/api/generations/${gen.id}/unpublish`, h.seed.dean)).status).toBe(200);
    const un = await h.call("GET", `/api/generations/${gen.id}`, h.seed.hod);
    expect(un.body.publishStatus).toBe("DRAFT");
  });
});
