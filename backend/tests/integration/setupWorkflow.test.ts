import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prismaMock, startHarness } from "../helpers/harness";

vi.mock("../../src/lib/prisma", () => prismaMock());

let h: Awaited<ReturnType<typeof startHarness>>;
const ctx: Record<string, any> = {};
beforeAll(async () => { h = await startHarness({ sections: 1 }); });
afterAll(async () => h?.stop());

const admin = () => h.seed.admin;
const post = (path: string, body: unknown, user = admin()) => h.call("POST", path, user, body);

describe("admin setup workflow through the real API, ending in a generated timetable", () => {
  it("creates institution, department, staff", async () => {
    const inst = await post("/api/institutions", { name: "Second Institute", code: "si" });
    expect(inst.status).toBe(201);
    expect(inst.body.code).toBe("SI");
    expect((await post("/api/institutions", { name: "Dup", code: "SI" })).status).toBe(409);
    ctx.inst = inst.body;
    const p = h.prisma;
    ctx.dept = await p.department.create({ data: { name: "Physics", code: "PHY", institutionId: inst.body.id } });
    const mk = (name: string, role: string, dep = ctx.dept.id) => p.user.create({ data: { name, email: `${name}@si.test`, passwordHash: "x".repeat(60), role, departmentId: dep } });
    ctx.hod = await mk("phyhod", "HOD");
    ctx.t1 = await mk("teacher1", "PROFESSOR");
    ctx.t2 = await mk("teacher2", "PROFESSOR");
    ctx.coord = await mk("coord", "COORDINATOR");
  });

  it("creates academic year, semester and the period grid; validates input", async () => {
    const y = await post("/api/academic-years", { institutionId: ctx.inst.id, label: "2026-27", startDate: "2026-07-01", endDate: "2027-06-30", isCurrent: true });
    expect(y.status).toBe(201);
    expect((await post("/api/academic-years", { institutionId: ctx.inst.id, label: "2025-26", startDate: "2026-07-01", endDate: "2026-01-01" })).status).toBe(400);
    const s = await post("/api/semesters", { academicYearId: y.body.id, name: "Odd", startDate: "2026-07-15", endDate: "2026-12-15", workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] });
    expect(s.status).toBe(201);
    ctx.sem = s.body;
    const bad = await h.call("PUT", `/api/semesters/${s.body.id}/periods`, admin(), { periods: [{ label: "I", startTime: "10:00", endTime: "09:00" }] });
    expect(bad.status).toBe(400);
    const ok = await h.call("PUT", `/api/semesters/${s.body.id}/periods`, admin(), { periods: [
      { label: "I", startTime: "09:00", endTime: "09:50" }, { label: "II", startTime: "09:50", endTime: "10:40" },
      { label: "Break", startTime: "10:40", endTime: "11:00", isBreak: true }, { label: "III", startTime: "11:00", endTime: "11:50" },
      { label: "IV", startTime: "11:50", endTime: "12:40" }, { label: "V", startTime: "12:40", endTime: "13:30" },
    ] });
    expect(ok.status).toBe(200);
    expect(ok.body.map((p: any) => p.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect((await post(`/api/semesters/${s.body.id}/holidays`, { date: "2026-10-02", name: "Gandhi Jayanti" })).status).toBe(201);
    expect((await h.call("GET", `/api/semesters/${s.body.id}`, h.seed.prof)).body.holidays.length).toBe(1);
    // writes need ADMIN
    expect((await post("/api/semesters", { academicYearId: y.body.id, name: "Even", startDate: "2027-01-05", endDate: "2027-05-01" }, h.seed.dean)).status).toBe(403);
  });

  it("creates program, subjects, rooms (with equipment), section with batches", async () => {
    const pr = await post("/api/programs", { departmentId: ctx.dept.id, code: "bsc", name: "B.Sc Physics" }, ctx.hod);
    expect(pr.status).toBe(201);
    expect(pr.body.code).toBe("BSC");
    expect((await post("/api/programs", { departmentId: ctx.dept.id, code: "BSC", name: "dup" }, ctx.hod)).status).toBe(409);
    expect((await post("/api/programs", { departmentId: h.seed.dept.id, code: "X", name: "Other dept" }, ctx.hod)).status).toBe(403);
    ctx.program = pr.body;
    const th = await post("/api/subjects", { departmentId: ctx.dept.id, code: "ph101", name: "Mechanics", credits: 4, type: "LECTURE", defaultSessionsPerWeek: 3 }, ctx.hod);
    const th2 = await post("/api/subjects", { departmentId: ctx.dept.id, code: "ph102", name: "Optics", credits: 3, type: "LECTURE", defaultSessionsPerWeek: 2 }, ctx.hod);
    const lab = await post("/api/subjects", { departmentId: ctx.dept.id, code: "ph191", name: "Optics Lab", credits: 2, type: "LAB", defaultSessionsPerWeek: 1, defaultBlockLength: 2, requiredRoomType: "LAB", requiredEquipment: ["Laser"] }, ctx.hod);
    expect([th.status, th2.status, lab.status]).toEqual([201, 201, 201]);
    ctx.th = th.body; ctx.th2 = th2.body; ctx.lab = lab.body;
    expect(lab.body.code).toBe("PH191");

    for (const r of [{ roomNumber: "P1", capacity: 60, type: "CLASSROOM" }, { roomNumber: "P2", capacity: 60, type: "CLASSROOM" },
      { roomNumber: "PL1", capacity: 30, type: "LAB", equipment: ["Microscope"] }, { roomNumber: "PL2", capacity: 30, type: "LAB", equipment: ["laser", "Bench"] }]) {
      const rr = await post("/api/rooms", { departmentId: ctx.dept.id, ...r }, ctx.coord);
      expect(rr.status).toBe(201);
      if (r.roomNumber === "PL2") ctx.laserRoom = rr.body;
    }
    const sec = await post("/api/sections", { programId: ctx.program.id, semesterId: ctx.sem.id, yearOfStudy: 1, name: "A", strength: 50, batches: [{ name: "B1", strength: 25 }, { name: "B2", strength: 25 }] }, ctx.hod);
    expect(sec.status).toBe(201);
    ctx.section = sec.body;
    expect((await post(`/api/sections/${sec.body.id}/batches`, { name: "B3", strength: 99 }, ctx.hod)).status).toBe(422);
  });

  it("applies subject defaults as requirements; enforces uniqueness and qualification", async () => {
    const r = await post(`/api/sections/${ctx.section.id}/requirements/apply-defaults`, { subjectIds: [ctx.th.id, ctx.th2.id, ctx.lab.id] }, ctx.hod);
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(4); // 2 theory + lab per batch
    const again = await post(`/api/sections/${ctx.section.id}/requirements/apply-defaults`, { subjectIds: [ctx.th.id] }, ctx.hod);
    expect(again.body).toMatchObject({ created: 0, skipped: ["PH101"] });
    const dup = await post("/api/requirements", { sectionId: ctx.section.id, subjectId: ctx.th.id, sessionsPerWeek: 2 }, ctx.hod);
    expect(dup.status).toBe(409);
    const list = await h.call("GET", `/api/requirements?sectionId=${ctx.section.id}`, h.seed.prof);
    expect(list.body.items.length).toBe(4);
    const labReq = list.body.items.find((x: any) => x.batch?.name === "B1");
    expect(labReq).toMatchObject({ blockLength: 2, roomType: "LAB", requiredEquipment: ["Laser"] });
    const unq = await h.call("PATCH", `/api/requirements/${list.body.items[0].id}`, ctx.hod, { assignedFacultyId: 999999 });
    expect(unq.status).toBe(422);
  });

  it("sets faculty profiles, qualifications and availability", async () => {
    const fp1 = await post("/api/faculty-profiles", { userId: ctx.t1.id, maxPeriodsPerWeek: 12 }, ctx.coord);
    const fp2 = await post("/api/faculty-profiles", { userId: ctx.t2.id }, ctx.coord);
    expect([fp1.status, fp2.status]).toEqual([201, 201]);
    expect((await post("/api/faculty-profiles", { userId: ctx.t1.id }, ctx.coord)).status).toBe(409);
    ctx.fp1 = fp1.body; ctx.fp2 = fp2.body;
    for (const fp of [fp1.body, fp2.body]) {
      const q = await h.call("PUT", `/api/faculty-profiles/${fp.id}/qualifications`, ctx.coord, { subjectIds: [ctx.th.id, ctx.th2.id, ctx.lab.id] });
      expect(q.status).toBe(200);
    }
    // a professor may edit only their own availability
    const bad = await h.call("PUT", `/api/faculty-profiles/${fp1.body.id}/availability`, ctx.t2, { semesterId: ctx.sem.id, slots: [] });
    expect(bad.status).toBe(403);
    const invalidDay = await h.call("PUT", `/api/faculty-profiles/${fp1.body.id}/availability`, ctx.t1, { semesterId: ctx.sem.id, slots: [{ day: "SATURDAY", periodIndex: 0, kind: "UNAVAILABLE" }] });
    expect(invalidDay.status).toBe(422);
    const invalidPeriod = await h.call("PUT", `/api/faculty-profiles/${fp1.body.id}/availability`, ctx.t1, { semesterId: ctx.sem.id, slots: [{ day: "MONDAY", periodIndex: 9, kind: "UNAVAILABLE" }] });
    expect(invalidPeriod.status).toBe(422);
    const slots = [0, 1, 3, 4, 5].map((periodIndex) => ({ day: "MONDAY", periodIndex, kind: "UNAVAILABLE" })); // t1 unavailable all Monday
    const ok = await h.call("PUT", `/api/faculty-profiles/${fp1.body.id}/availability`, ctx.t1, { semesterId: ctx.sem.id, slots });
    expect(ok.status).toBe(200);
    const read = await h.call("GET", `/api/faculty-profiles/${fp1.body.id}/availability?semesterId=${ctx.sem.id}`, ctx.t1);
    expect(read.body.items.length).toBe(5);
    const list = await h.call("GET", `/api/faculty-profiles?departmentId=${ctx.dept.id}`, ctx.hod);
    expect(list.body.items.length).toBe(2);
    expect(list.body.items[0].qualifications.length).toBe(3);
  });

  it("generates a timetable from the API-created data that respects availability and equipment", async () => {
    const gen = await h.generate(ctx.hod, [ctx.section.id], ctx.sem.id);
    expect(gen.status).toBe("COMPLETED");
    expect(gen.solveStatus).toBe("COMPLETE");
    expect(gen.totalSessions).toBe(3 + 2 + 2);
    const tt = (await h.call("GET", `/api/generations/${gen.id}/entries`, ctx.hod)).body;
    expect(tt.entries.filter((e: any) => e.facultyProfileId === ctx.fp1.id && e.day === "MONDAY")).toEqual([]);
    const labs = tt.entries.filter((e: any) => e.subjectType === "LAB");
    expect(labs.length).toBe(2);
    expect(labs.every((e: any) => e.roomId === ctx.laserRoom.id)).toBe(true); // only PL2 has a laser
    // seeded institution's rooms/faculty were not touched by this institution's timetable
    expect(tt.entries.every((e: any) => e.roomNumber.startsWith("P"))).toBe(true);
    ctx.gen = gen;
  });

  it("protects the period grid once timetables exist, and sections with entries", async () => {
    const r = await h.call("PUT", `/api/semesters/${ctx.sem.id}/periods`, admin(), { periods: [{ label: "I", startTime: "09:00", endTime: "09:50" }] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("TIMETABLE_EXISTS");
    expect((await h.call("DELETE", `/api/sections/${ctx.section.id}`, ctx.hod)).status).toBe(409);
    expect((await h.call("DELETE", `/api/semesters/${ctx.sem.id}`, admin())).status).toBe(409);
  });

  it("reports an unequipped lab as an infeasibility with a clear reason", async () => {
    await h.prisma.room.update({ where: { id: ctx.laserRoom.id }, data: { equipment: ["Bench"] } });
    const gen = await h.generate(ctx.hod, [ctx.section.id], ctx.sem.id);
    expect(gen.solveStatus).toBe("INFEASIBLE");
    const c = (await h.call("GET", `/api/generations/${gen.id}/conflicts?kind=INFEASIBLE`, ctx.hod)).body.items;
    expect(c.length).toBeGreaterThan(0);
    expect(c.map((x: any) => x.message).join(" ")).toMatch(/equipment/i);
  });
});
