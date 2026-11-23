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

const get = (q: string, user = h.seed.hod) => h.call("GET", `/api/analytics/schedule?${q}`, user);

describe("schedule analytics", () => {
  it("requires auth and a semester", async () => {
    expect((await h.call("GET", "/api/analytics/schedule?semesterId=1", null)).status).toBe(401);
    expect((await get("")).status).toBe(400);
  });

  it("computes figures that match the stored entries exactly", async () => {
    const r = await get(`semesterId=${h.seed.semester.id}`);
    expect(r.status).toBe(200);
    const a = r.body;
    expect(a.scope.generationIds).toEqual([gen.id]); // unpublished -> newest completed draft
    expect(a.scope.published).toBe(false);
    expect(a.scope.slotsPerWeek).toBe(5 * 6);
    const entries = await h.prisma.timetableEntry.findMany({ where: { generationId: gen.id } });
    const periods = entries.reduce((n: number, e: any) => n + e.length, 0);
    expect(a.summary.requiredSessions).toBe(gen.totalSessions);
    expect(a.summary.scheduledSessions).toBe(entries.length);
    expect(a.summary.completion).toBe(100);
    expect(a.rooms.reduce((n: number, x: any) => n + x.usedPeriods, 0)).toBe(periods);
    expect(a.faculty.reduce((n: number, x: any) => n + x.periods, 0)).toBe(periods);
    expect(a.heatmap.reduce((n: number, x: any) => n + x.classes, 0)).toBe(periods);
    expect(a.heatmap.length).toBe(30);
    expect(a.sections.every((s: any) => s.completion === 100)).toBe(true);
    expect(a.departments[0]).toMatchObject({ department: "CSE", sections: 2 });
    expect(a.unassigned).toEqual([]);
    expect(a.summary.overloadedFaculty).toBe(0);
  });

  it("reflects a deleted session as an unassigned lecture", async () => {
    const e = await h.prisma.timetableEntry.findFirst({ where: { generationId: gen.id, batchId: null } });
    await h.call("DELETE", `/api/generations/${gen.id}/entries/${e.id}`, h.seed.hod);
    const a = (await get(`semesterId=${h.seed.semester.id}&generationId=${gen.id}`)).body;
    expect(a.summary.unassignedSessions).toBe(1);
    expect(a.unassigned[0]).toMatchObject({ requirementId: e.requirementId, missingSessions: 1 });
    expect(a.summary.completion).toBeLessThan(100);
  });

  it("uses published generations once there are some", async () => {
    // restore the session then publish
    const e = await h.prisma.timetableEntry.findMany({ where: { generationId: gen.id } });
    const missing = (await h.call("GET", `/api/generations/${gen.id}/conflicts?kind=UNASSIGNED`, h.seed.hod)).body.items[0];
    expect(missing).toBeTruthy();
    const regen = await h.generate(h.seed.hod, h.seed.sections.map((s: any) => s.id), h.seed.semester.id, { seed: 5, timeLimitMs: 10000 });
    expect((await h.call("POST", `/api/generations/${regen.id}/publish`, h.seed.dean, { replace: true })).status).toBe(200);
    const a = (await get(`semesterId=${h.seed.semester.id}`)).body;
    expect(a.scope.generationIds).toEqual([regen.id]);
    expect(a.scope.published).toBe(true);
    expect(a.summary.completion).toBe(100);
    expect(e.length).toBeGreaterThan(0);
  });
});
