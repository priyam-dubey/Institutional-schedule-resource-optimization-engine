import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prismaMock, startHarness } from "../helpers/harness";

vi.mock("../../src/lib/prisma", () => prismaMock());
let h: Awaited<ReturnType<typeof startHarness>>;
let jobId: string;
let payload: any;
let target: { semesterId: number; sectionId: number };

beforeAll(async () => {
  h = await startHarness({ sections: 1 });
  target = { semesterId: h.seed.semester.id, sectionId: h.seed.sections[0].id };
});
afterAll(async () => h?.stop());

async function upload(user: any, name = "timetable.pdf", data?: Buffer, type = "application/pdf") {
  const fd = new FormData();
  fd.append("file", new Blob([data ?? fs.readFileSync(path.join(__dirname, "../fixtures/timetable.pdf"))], { type }), name);
  const r = await fetch(h.base + "/api/upload/pdf", { method: "POST", headers: { authorization: `Bearer ${h.tokenFor(user)}` }, body: fd });
  return { status: r.status, body: await r.json() };
}
async function waitJob(id: string, want: string[]) {
  for (let i = 0; i < 200; i++) {
    const j = (await h.call("GET", `/api/ingestion/${id}`, h.seed.hod)).body;
    if (want.includes(j.status)) return j;
    await new Promise((s) => setTimeout(s, 100));
  }
  throw new Error("timeout");
}

describe("PDF ingestion: extract -> review -> validate -> commit", () => {
  it("rejects non-PDF uploads and unauthorised users", async () => {
    expect((await upload(h.seed.prof)).status).toBe(403);
    expect((await upload(h.seed.hod, "notes.txt", Buffer.from("hello"), "text/plain")).status).toBe(400);
  });

  it("extracts the PDF into staged rows and persists NOTHING to timetable tables", async () => {
    const before = await h.prisma.timetableGeneration.count();
    const up = await upload(h.seed.hod);
    expect(up.status).toBe(202);
    jobId = up.body.jobId;
    const job = await waitJob(jobId, ["AWAITING_REVIEW", "FAILED"]);
    expect(job.status).toBe("AWAITING_REVIEW");
    payload = job.payload;
    expect(payload.meta).toMatchObject({ department: "CSE", section: "A" });
    expect(payload.rows.length).toBe(10);
    expect(job.totalRows).toBe(10);
    expect(await h.prisma.timetableGeneration.count()).toBe(before);
    expect(await h.prisma.timetableEntry.count()).toBe(0);
    expect(await h.prisma.timetableSlot.count()).toBe(0);
    // "CS 202" was matched to CS202; the lab instructor (sole qualified) was pre-filled; XYZ9 is unmatched
    const by = (code: string) => payload.rows.filter((r: any) => r.subjectCode === code);
    expect(by("CS202").length).toBe(2);
    expect(by("CS290")[0].facultyProfileId).toBeTruthy();
    expect(by("XYZ9")[0].matched).toBe(false);
  });

  it("validation reports unresolved rows precisely and blocks the commit", async () => {
    const v = await h.call("POST", `/api/ingestion/${jobId}/validate`, h.seed.hod, target);
    expect(v.status).toBe(200);
    expect(v.body.ok).toBe(false);
    const codes = v.body.issues.map((i: any) => i.code);
    expect(codes).toContain("UNKNOWN_SUBJECT");
    expect(codes).toContain("FACULTY_MISSING");
    const c = await h.call("POST", `/api/ingestion/${jobId}/commit`, h.seed.hod, target);
    expect(c.status).toBe(409);
    expect(c.body.code).toBe("VALIDATION_FAILED");
    expect(await h.prisma.timetableEntry.count()).toBe(0);
  });

  it("edits are validated: a double-booked teacher is caught row-by-row", async () => {
    const rows = payload.rows
      .filter((r: any) => r.subjectCode !== "XYZ9")
      .map((r: any) => ({ ...r, facultyProfileId: r.facultyProfileId ?? h.seed.profiles[0].id }));
    // make every non-lab class use the SAME teacher so Monday I/II/III/IV collide? No: collisions need same slot.
    // Force a real clash: put a second class into MONDAY I with the same teacher.
    const first = rows.find((r: any) => r.day === "MONDAY" && r.periodLabel === "I");
    rows.push({ ...first, id: "dup", subjectCode: "CS201", roomNumber: "C101" });
    const save = await h.call("PUT", `/api/ingestion/${jobId}/payload`, h.seed.hod, { meta: payload.meta, rows });
    expect(save.status).toBe(200);
    const v = await h.call("POST", `/api/ingestion/${jobId}/validate`, h.seed.hod, target);
    expect(v.body.ok).toBe(false);
    const hit = v.body.issues.filter((i: any) => i.code === "FACULTY_CONFLICT" || i.code === "GROUP_CONFLICT");
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.some((i: any) => i.rowId === "dup" || i.rowId === first.id)).toBe(true);
    payload = { meta: payload.meta, rows: rows.filter((r: any) => r.id !== "dup") };
  });

  it("after corrections the import validates and commits as an IMPORTED draft that can be published", async () => {
    // give each subject its own teacher so there are no clashes, and make the lab a 2-period block in a lab room
    const fp = new Map<string, number>();
    const prof = h.seed.profiles;
    const quals = await h.prisma.facultySubject.findMany({ include: { subject: true } });
    for (const q of quals) if (!fp.has(q.subject.code)) fp.set(q.subject.code, q.facultyProfileId);
    const rows = payload.rows.map((r: any) => ({
      ...r,
      facultyProfileId: fp.get(r.subjectCode)!,
      ...(r.subjectCode === "CS290" ? { length: 2, startPeriod: undefined } : {}),
    }));
    expect(prof.length).toBeGreaterThan(0);
    const save = await h.call("PUT", `/api/ingestion/${jobId}/payload`, h.seed.hod, { meta: payload.meta, rows });
    expect(save.status).toBe(200);
    const v = await h.call("POST", `/api/ingestion/${jobId}/validate`, h.seed.hod, target);
    expect(v.body.issues.filter((i: any) => i.severity === "error")).toEqual([]);
    expect(v.body.ok).toBe(true);

    const c = await h.call("POST", `/api/ingestion/${jobId}/commit`, h.seed.hod, { ...target, name: "Imported timetable" });
    expect(c.status).toBe(201);
    expect(c.body.entries).toBe(9);
    const gen = (await h.call("GET", `/api/generations/${c.body.generationId}`, h.seed.hod)).body;
    expect(gen).toMatchObject({ source: "IMPORTED", status: "COMPLETED", publishStatus: "DRAFT" });
    expect(gen.conflictCounts.HARD ?? 0).toBe(0);
    // requirements not covered by the PDF show up as unassigned (it is a partial timetable)
    expect(gen.conflictCounts.UNASSIGNED).toBeGreaterThan(0);

    const job = await waitJob(jobId, ["DONE"]);
    expect(job.committedGenerationId).toBe(c.body.generationId);
    // cannot be edited or committed twice
    expect((await h.call("PUT", `/api/ingestion/${jobId}/payload`, h.seed.hod, { meta: {}, rows: [] })).status).toBe(409);
    expect((await h.call("POST", `/api/ingestion/${jobId}/commit`, h.seed.hod, target)).status).toBe(409);

    const noPartial = await h.call("POST", `/api/generations/${gen.id}/publish`, h.seed.dean, {});
    expect(noPartial.body.code).toBe("INCOMPLETE");
    const pub = await h.call("POST", `/api/generations/${gen.id}/publish`, h.seed.dean, { allowPartial: true });
    expect(pub.status).toBe(200);
  });

  it("a staged job can be discarded", async () => {
    const up = await upload(h.seed.hod);
    await waitJob(up.body.jobId, ["AWAITING_REVIEW"]);
    expect((await h.call("POST", `/api/ingestion/${up.body.jobId}/discard`, h.seed.hod)).status).toBe(200);
    expect((await waitJob(up.body.jobId, ["CANCELLED"])).status).toBe("CANCELLED");
  });

  it("a corrupt PDF fails the job with a readable error", async () => {
    const up = await upload(h.seed.hod, "bad.pdf", Buffer.from("%PDF-1.4 not really a pdf"));
    const j = await waitJob(up.body.jobId, ["FAILED"]);
    expect(JSON.stringify(j.errorLog)).toMatch(/./);
  });
});
