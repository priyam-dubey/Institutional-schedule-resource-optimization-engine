import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "net";
import { createTestDb, testDbRef } from "../helpers/db";
import { seedBasic } from "../helpers/fixture";

vi.mock("../../src/lib/prisma", () => ({
  prisma: new Proxy({}, {
    get: (_t, k) => {
      const c = testDbRef.db!.prisma;
      const v = c[k];
      return typeof v === "function" ? v.bind(c) : v;
    },
  }),
}));

let base = "";
let seed: Awaited<ReturnType<typeof seedBasic>>;
let worker: { close: () => Promise<void> };
let httpServer: import("http").Server;
const events: any[] = [];
let sub: import("ioredis").Redis;

const tokenFor = (u: { id: number; email: string; role: string; departmentId: number }) =>
  jwt.sign({ sub: String(u.id), email: u.email, role: u.role, departmentId: u.departmentId }, process.env.JWT_SECRET!, { algorithm: "HS256" });
const call = async (method: string, path: string, user: any, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${tokenFor(user)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
async function waitFor(id: number, user: any, want = ["COMPLETED", "FAILED", "CANCELLED"], ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const r = await call("GET", `/api/generations/${id}`, user);
    if (want.includes(r.body.status)) return r.body;
    if (Date.now() > end) throw new Error(`timeout waiting for generation ${id}: ${JSON.stringify(r.body)}`);
    await new Promise((s) => setTimeout(s, 150));
  }
}

beforeAll(async () => {
  testDbRef.db = await createTestDb();
  seed = await seedBasic(testDbRef.db.prisma, { sections: 3 });
  const { httpServer: hs } = await import("../../src/api/server");
  httpServer = hs;
  await new Promise<void>((r) => hs.listen(0, r));
  base = `http://127.0.0.1:${(hs.address() as AddressInfo).port}`;
  const { startGenerationWorker } = await import("../../src/workers/generationWorker");
  worker = startGenerationWorker();
  const { getRedis } = await import("../../src/lib/redis");
  sub = getRedis().duplicate();
  await sub.subscribe("samayak:events");
  sub.on("message", (_c, m) => events.push(JSON.parse(m)));
});

afterAll(async () => {
  await worker?.close();
  sub?.disconnect();
  const { getRedis } = await import("../../src/lib/redis");
  getRedis().disconnect();
  await new Promise((r) => httpServer?.close(r));
  await testDbRef.db?.close();
});

describe("timetable generation, end to end (HTTP -> BullMQ -> worker thread -> Postgres)", () => {
  let genA: number;

  it("rejects unauthenticated and under-privileged callers", async () => {
    const r0 = await fetch(base + "/api/generations", { method: "POST" });
    expect(r0.status).toBe(401);
    const r1 = await call("POST", "/api/generations", seed.prof, { semesterId: seed.semester.id, sectionIds: [seed.sections[0].id] });
    expect(r1.status).toBe(403);
    const r2 = await call("POST", "/api/generations", seed.hodOther, { semesterId: seed.semester.id, sectionIds: [seed.sections[0].id] });
    expect(r2.status).toBe(403); // other department's HOD
    const r3 = await call("POST", "/api/generations", seed.hod, { semesterId: seed.semester.id, sectionIds: [] });
    expect(r3.status).toBe(400);
  });

  it("generates a complete timetable for sections A and B and reports live progress", async () => {
    const created = await call("POST", "/api/generations", seed.hod, {
      semesterId: seed.semester.id,
      sectionIds: [seed.sections[0].id, seed.sections[1].id],
      name: "A+B",
      config: { seed: 7, timeLimitMs: 10000 },
    });
    expect(created.status).toBe(202);
    expect(created.body.version).toBe(1);
    genA = created.body.id;
    const done = await waitFor(genA, seed.hod);
    expect(done.status).toBe("COMPLETED");
    expect(done.solveStatus).toBe("COMPLETE");
    expect(done.assignedSessions).toBe(done.totalSessions);
    // 2 sections x (4 subjects x 3 sessions + 2 batch labs x 1 session)
    expect(done.totalSessions).toBe(2 * (4 * 3 + 2));
    expect(done._count.entries).toBe(done.totalSessions);
    expect(done.progress).toBe(100);
    expect(typeof done.score).toBe("number");

    await new Promise((r) => setTimeout(r, 300));
    const mine = events.filter((e) => e.generationId === genA).map((e) => e.type);
    expect(mine).toContain("generation.queued");
    expect(mine).toContain("generation.progress");
    expect(mine).toContain("generation.completed");
  });

  it("the stored timetable passes the independent validator", async () => {
    const v = await call("GET", `/api/generations/${genA}/validate`, seed.hod);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ valid: true, complete: true, totalViolations: 0 });
  });

  it("labs go to equipped lab rooms in 2-period blocks that never straddle the break", async () => {
    const entries = await testDbRef.db!.prisma.timetableEntry.findMany({ where: { generationId: genA }, include: { room: true } });
    const labs = entries.filter((e: any) => e.batchId);
    expect(labs.length).toBe(4);
    for (const e of labs) {
      expect(e.room.type).toBe("LAB");
      expect(e.length).toBe(2);
      // period position 3 is the break: a 2-block may not include it
      expect(e.startPeriod <= 2 ? e.startPeriod + e.length <= 3 : e.startPeriod >= 4).toBe(true);
    }
  });

  it("only a dean (or above) can publish; the HOD cannot", async () => {
    const denied = await call("POST", `/api/generations/${genA}/publish`, seed.hod, {});
    expect(denied.status).toBe(403);
    const ok = await call("POST", `/api/generations/${genA}/publish`, seed.dean, {});
    expect(ok.status).toBe(200);
    expect(ok.body.generation.publishStatus).toBe("PUBLISHED");
  });

  it("a second generation for another section cannot collide with the published one", async () => {
    const created = await call("POST", "/api/generations", seed.hod, {
      semesterId: seed.semester.id, sectionIds: [seed.sections[2].id], config: { seed: 1, timeLimitMs: 10000 },
    });
    expect(created.body.version).toBe(2);
    const done = await waitFor(created.body.id, seed.hod);
    expect(done.status).toBe("COMPLETED");
    const pub = await call("POST", `/api/generations/${created.body.id}/publish`, seed.dean, {});
    expect(pub.status).toBe(200);
    // union validation of both published generations
    const v = await call("GET", `/api/generations/${created.body.id}/validate`, seed.dean);
    expect(v.body.valid).toBe(true);
    // no faculty or room is double-booked across the two published generations
    const all = await testDbRef.db!.prisma.timetableEntry.findMany({ where: { generation: { publishStatus: "PUBLISHED" } } });
    const seen = new Set<string>();
    for (const e of all) {
      for (let k = 0; k < e.length; k++) {
        for (const key of [`f${e.facultyProfileId}`, `r${e.roomId}`]) {
          const cell = `${key}|${e.day}|${e.startPeriod + k}`;
          expect(seen.has(cell)).toBe(false);
          seen.add(cell);
        }
      }
    }
  });

  it("refuses to publish a timetable that a direct DB tamper made invalid", async () => {
    const created = await call("POST", "/api/generations", seed.hod, {
      semesterId: seed.semester.id, sectionIds: [seed.sections[2].id], config: { seed: 99, timeLimitMs: 10000 },
    });
    const done = await waitFor(created.body.id, seed.hod);
    expect(done.status).toBe("COMPLETED");
    // move one entry onto a faculty member's slot from the published generation
    const prisma = testDbRef.db!.prisma;
    const pubEntry = await prisma.timetableEntry.findFirst({ where: { generation: { publishStatus: "PUBLISHED", id: genA } } });
    const victim = await prisma.timetableEntry.findFirst({ where: { generationId: created.body.id, batchId: null } });
    await prisma.timetableEntry.update({
      where: { id: victim.id },
      data: { facultyProfileId: pubEntry.facultyProfileId, day: pubEntry.day, startPeriod: pubEntry.startPeriod, length: 1 },
    });
    const replace = await call("POST", `/api/generations/${created.body.id}/publish`, seed.dean, { replace: true });
    expect(replace.status).toBe(409);
    expect(replace.body.code).toBe("VALIDATION_FAILED");
    expect(replace.body.details.violations.some((x: any) => x.type === "FACULTY_CONFLICT")).toBe(true);
    const still = await prisma.timetableGeneration.findUnique({ where: { id: created.body.id } });
    expect(still.publishStatus).toBe("DRAFT");
  });

  it("requires explicit replace when a published timetable covers the same sections", async () => {
    const created = await call("POST", `/api/generations/${genA}/regenerate`, seed.hod, {});
    expect(created.status).toBe(202);
    const done = await waitFor(created.body.id, seed.hod);
    expect(done.status).toBe("COMPLETED");
    const noReplace = await call("POST", `/api/generations/${created.body.id}/publish`, seed.dean, {});
    expect(noReplace.status).toBe(409);
    expect(noReplace.body.code).toBe("SECTION_OVERLAP");
    const withReplace = await call("POST", `/api/generations/${created.body.id}/publish`, seed.dean, { replace: true });
    expect(withReplace.status).toBe(200);
    expect(withReplace.body.archived).toContain(genA);
    const old = await call("GET", `/api/generations/${genA}`, seed.dean);
    expect(old.body.publishStatus).toBe("ARCHIVED");
  });

  it("reports unassigned sessions and infeasibility, and blocks incomplete publishing unless allowed", async () => {
    const prisma = testDbRef.db!.prisma;
    // a section with a subject nobody is qualified to teach
    const orphan = await prisma.subject.create({ data: { departmentId: seed.dept.id, code: "CS999", name: "Orphan", credits: 3, type: "LECTURE" } });
    const sec = await prisma.section.create({ data: { programId: seed.program.id, semesterId: seed.semester.id, yearOfStudy: 3, name: "Z", strength: 50 } });
    await prisma.subjectRequirement.create({ data: { sectionId: sec.id, subjectId: orphan.id, sessionsPerWeek: 2 } });
    await prisma.subjectRequirement.create({ data: { sectionId: sec.id, subjectId: seed.subjects[0].id, sessionsPerWeek: 2 } });
    const created = await call("POST", "/api/generations", seed.hod, { semesterId: seed.semester.id, sectionIds: [sec.id], config: { timeLimitMs: 5000 } });
    const done = await waitFor(created.body.id, seed.hod);
    expect(done.status).toBe("COMPLETED");
    expect(["INFEASIBLE", "PARTIAL"]).toContain(done.solveStatus);
    expect(done.assignedSessions).toBe(2);
    expect(done.totalSessions).toBe(4);
    const c = await call("GET", `/api/generations/${created.body.id}/conflicts`, seed.hod);
    const kinds = c.body.items.map((x: any) => x.kind);
    expect(kinds).toContain("UNASSIGNED");
    expect(kinds).toContain("INFEASIBLE");
    expect(c.body.items.find((x: any) => x.kind === "UNASSIGNED").message).toMatch(/CS999/);

    const blocked = await call("POST", `/api/generations/${created.body.id}/publish`, seed.dean, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("INCOMPLETE");
    const allowed = await call("POST", `/api/generations/${created.body.id}/publish`, seed.dean, { allowPartial: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.complete).toBe(false);
  });

  it("fails cleanly when a section has no requirements", async () => {
    const prisma = testDbRef.db!.prisma;
    const sec = await prisma.section.create({ data: { programId: seed.program.id, semesterId: seed.semester.id, yearOfStudy: 4, name: "E", strength: 40 } });
    const created = await call("POST", "/api/generations", seed.hod, { semesterId: seed.semester.id, sectionIds: [sec.id] });
    const done = await waitFor(created.body.id, seed.hod);
    expect(done.status).toBe("FAILED");
    expect(done.errorMessage).toMatch(/no subject requirements/);
    const pub = await call("POST", `/api/generations/${created.body.id}/publish`, seed.dean, {});
    expect(pub.status).toBe(409);
  });

  it("cancels a queued/running generation", async () => {
    const created = await call("POST", "/api/generations", seed.hod, { semesterId: seed.semester.id, sectionIds: [seed.sections[2].id] });
    const c = await call("POST", `/api/generations/${created.body.id}/cancel`, seed.hod);
    // either it was still queued/running (CANCELLED) or the worker already finished it (409)
    expect([200, 409]).toContain(c.status);
    if (c.status === 200) {
      const final = await waitFor(created.body.id, seed.hod, ["CANCELLED", "COMPLETED", "FAILED"]);
      expect(final.status).toBe("CANCELLED");
    }
  });
});
