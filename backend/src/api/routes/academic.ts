/**
 * Academic setup APIs used by the admin workflow:
 * institution, academic years, semesters (+periods, holidays), programs, subjects,
 * sections (+batches), subject requirements, faculty profiles (+qualifications,
 * availability) and room availability.
 *
 * Reads: any authenticated user. Writes: role-gated; department-scoped for HOD and below.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requireRole, HIERARCHY } from "../../middleware/rbac";
import { asyncHandler, HttpError } from "../../lib/httpError";
import { DAY_ORDER } from "../../services/scheduleInput";

const router = Router();
router.use(authenticate);

const Day = z.enum(DAY_ORDER as [string, ...string[]]);
const id = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
};
const crossDept = (req: Request) => HIERARCHY[req.user!.role] >= HIERARCHY.DEAN;
function assertDept(req: Request, departmentId: number) {
  if (!crossDept(req) && req.user!.departmentId !== departmentId) throw new HttpError(403, "You can only modify your own department's data");
}
const date = z.coerce.date();

// ── Institution ─────────────────────────────────────────────────────────────
const InstitutionSchema = z.object({
  name: z.string().min(2).max(300),
  code: z.string().min(2).max(30).transform((s) => s.toUpperCase()),
  timezone: z.string().max(64).optional(),
  address: z.string().max(500).nullable().optional(),
});
router.get("/institutions", asyncHandler(async (_req, res) => {
  res.json({ items: await prisma.institution.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { departments: true, academicYears: true } } } }) });
}));
router.post("/institutions", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  res.status(201).json(await prisma.institution.create({ data: InstitutionSchema.parse(req.body) }));
}));
router.patch("/institutions/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  res.json(await prisma.institution.update({ where: { id: id(req.params.id) }, data: InstitutionSchema.partial().parse(req.body) }));
}));

// ── Academic years ──────────────────────────────────────────────────────────
const YearSchema = z.object({
  institutionId: z.number().int().positive(),
  label: z.string().min(4).max(20),
  startDate: date,
  endDate: date,
  isCurrent: z.boolean().optional(),
}).refine((y) => y.endDate > y.startDate, { message: "endDate must be after startDate", path: ["endDate"] });
router.get("/academic-years", asyncHandler(async (req, res) => {
  const institutionId = req.query.institutionId ? id(String(req.query.institutionId)) : undefined;
  res.json({ items: await prisma.academicYear.findMany({ where: { institutionId }, orderBy: { startDate: "desc" }, include: { semesters: { orderBy: { startDate: "asc" } } } }) });
}));
router.post("/academic-years", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const b = YearSchema.parse(req.body);
  const y = await prisma.$transaction(async (tx) => {
    if (b.isCurrent) await tx.academicYear.updateMany({ where: { institutionId: b.institutionId }, data: { isCurrent: false } });
    return tx.academicYear.create({ data: b });
  });
  res.status(201).json(y);
}));
router.patch("/academic-years/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const yid = id(req.params.id);
  const b = z.object({ label: z.string().min(4).max(20), startDate: date, endDate: date, isCurrent: z.boolean() }).partial().parse(req.body);
  const y = await prisma.$transaction(async (tx) => {
    const cur = await tx.academicYear.findUniqueOrThrow({ where: { id: yid } });
    if (b.isCurrent) await tx.academicYear.updateMany({ where: { institutionId: cur.institutionId, id: { not: yid } }, data: { isCurrent: false } });
    return tx.academicYear.update({ where: { id: yid }, data: b });
  });
  res.json(y);
}));
router.delete("/academic-years/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const n = await prisma.semester.count({ where: { academicYearId: id(req.params.id) } });
  if (n) throw new HttpError(409, `Delete its ${n} semester(s) first`);
  await prisma.academicYear.delete({ where: { id: id(req.params.id) } });
  res.status(204).end();
}));

// ── Semesters, periods, holidays ────────────────────────────────────────────
const SemesterSchema = z.object({
  academicYearId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  startDate: date,
  endDate: date,
  workingDays: z.array(Day).min(1).max(7).refine((a) => new Set(a).size === a.length, "duplicate days").default(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]),
});
router.get("/semesters", asyncHandler(async (req, res) => {
  const academicYearId = req.query.academicYearId ? id(String(req.query.academicYearId)) : undefined;
  res.json({ items: await prisma.semester.findMany({ where: { academicYearId }, orderBy: { startDate: "desc" }, include: { academicYear: { select: { label: true } }, _count: { select: { sections: true, periods: true, generations: true } } } }) });
}));
router.get("/semesters/:id", asyncHandler(async (req, res) => {
  const s = await prisma.semester.findUnique({ where: { id: id(req.params.id) }, include: { periods: { orderBy: { index: "asc" } }, holidays: { orderBy: { date: "asc" } }, academicYear: true } });
  if (!s) throw new HttpError(404, "Semester not found");
  res.json(s);
}));
router.post("/semesters", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const b = SemesterSchema.parse(req.body);
  if (b.endDate <= b.startDate) throw new HttpError(400, "endDate must be after startDate");
  res.status(201).json(await prisma.semester.create({ data: b as never }));
}));
async function guardGrid(semesterId: number, what: string) {
  const n = await prisma.timetableGeneration.count({ where: { semesterId } });
  if (n) throw new HttpError(409, `${n} timetable generation(s) exist for this semester; changing ${what} would invalidate their stored period positions. Create a new semester instead.`, undefined, "TIMETABLE_EXISTS");
}
router.patch("/semesters/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const sid = id(req.params.id);
  const b = SemesterSchema.omit({ academicYearId: true }).partial().parse(req.body);
  if (b.workingDays) await guardGrid(sid, "the working days");
  res.json(await prisma.semester.update({ where: { id: sid }, data: b as never }));
}));
router.delete("/semesters/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const sid = id(req.params.id);
  const [sec, gen] = await Promise.all([prisma.section.count({ where: { semesterId: sid } }), prisma.timetableGeneration.count({ where: { semesterId: sid } })]);
  if (sec || gen) throw new HttpError(409, `Semester has ${sec} section(s) and ${gen} timetable generation(s)`);
  await prisma.semester.delete({ where: { id: sid } });
  res.status(204).end();
}));
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const PeriodsSchema = z.object({
  periods: z.array(z.object({ label: z.string().min(1).max(30), startTime: HHMM, endTime: HHMM, isBreak: z.boolean().default(false) })).min(1).max(16),
}).superRefine((v, ctx) => {
  v.periods.forEach((p, i) => {
    if (p.endTime <= p.startTime) ctx.addIssue({ code: "custom", path: ["periods", i, "endTime"], message: "must be after startTime" });
    if (i > 0 && p.startTime < v.periods[i - 1].endTime) ctx.addIssue({ code: "custom", path: ["periods", i, "startTime"], message: "overlaps the previous period" });
  });
  if (!v.periods.some((p) => !p.isBreak)) ctx.addIssue({ code: "custom", path: ["periods"], message: "at least one teaching period is required" });
});
/** Replace the whole period grid (index = position). Blocked once timetables exist for the semester. */
router.put("/semesters/:id/periods", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const sid = id(req.params.id);
  const b = PeriodsSchema.parse(req.body);
  await guardGrid(sid, "the period grid");
  await prisma.$transaction(async (tx) => {
    await tx.semesterPeriod.deleteMany({ where: { semesterId: sid } });
    await tx.semesterPeriod.createMany({ data: b.periods.map((p, index) => ({ ...p, index, semesterId: sid })) });
  });
  res.json(await prisma.semesterPeriod.findMany({ where: { semesterId: sid }, orderBy: { index: "asc" } }));
}));
router.post("/semesters/:id/holidays", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const b = z.object({ date, name: z.string().min(1).max(200) }).parse(req.body);
  res.status(201).json(await prisma.holiday.create({ data: { ...b, semesterId: id(req.params.id) } }));
}));
router.delete("/semesters/:id/holidays/:hid", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  await prisma.holiday.deleteMany({ where: { id: id(req.params.hid), semesterId: id(req.params.id) } });
  res.status(204).end();
}));

// ── Programs ────────────────────────────────────────────────────────────────
const ProgramSchema = z.object({
  departmentId: z.number().int().positive(),
  code: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  name: z.string().min(2).max(200),
  level: z.string().max(30).nullable().optional(),
  durationYears: z.number().int().min(1).max(8).default(4),
});
router.get("/programs", asyncHandler(async (req, res) => {
  const departmentId = req.query.departmentId ? id(String(req.query.departmentId)) : undefined;
  res.json({ items: await prisma.program.findMany({ where: { departmentId }, orderBy: [{ departmentId: "asc" }, { code: "asc" }], include: { department: { select: { code: true, name: true } }, _count: { select: { sections: true } } } }) });
}));
router.post("/programs", requireRole("HOD"), asyncHandler(async (req, res) => {
  const b = ProgramSchema.parse(req.body);
  assertDept(req, b.departmentId);
  res.status(201).json(await prisma.program.create({ data: b }));
}));
router.patch("/programs/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const cur = await prisma.program.findUniqueOrThrow({ where: { id: id(req.params.id) } });
  assertDept(req, cur.departmentId);
  res.json(await prisma.program.update({ where: { id: cur.id }, data: ProgramSchema.omit({ departmentId: true }).partial().parse(req.body) }));
}));
router.delete("/programs/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const cur = await prisma.program.findUniqueOrThrow({ where: { id: id(req.params.id) } });
  assertDept(req, cur.departmentId);
  await prisma.program.delete({ where: { id: cur.id } });
  res.status(204).end();
}));

// ── Subjects ────────────────────────────────────────────────────────────────
const SubjectSchema = z.object({
  departmentId: z.number().int().positive(),
  code: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  name: z.string().min(2).max(300),
  credits: z.number().min(0).max(30),
  type: z.enum(["LECTURE", "LAB", "TUTORIAL"]),
  defaultSessionsPerWeek: z.number().int().min(1).max(12).default(3),
  defaultBlockLength: z.number().int().min(1).max(4).default(1),
  requiredRoomType: z.enum(["CLASSROOM", "LAB", "OTHER"]).default("CLASSROOM"),
  requiredEquipment: z.array(z.string().min(1).max(50)).max(20).default([]),
});
router.get("/subjects", asyncHandler(async (req, res) => {
  const departmentId = req.query.departmentId ? id(String(req.query.departmentId)) : undefined;
  const search = typeof req.query.search === "string" && req.query.search ? req.query.search : undefined;
  res.json({ items: await prisma.subject.findMany({
    where: { departmentId, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}) },
    orderBy: [{ departmentId: "asc" }, { code: "asc" }], take: 500,
    include: { department: { select: { code: true } }, _count: { select: { qualified: true, requirements: true } } },
  }) });
}));
router.post("/subjects", requireRole("HOD"), asyncHandler(async (req, res) => {
  const b = SubjectSchema.parse(req.body);
  assertDept(req, b.departmentId);
  res.status(201).json(await prisma.subject.create({ data: b }));
}));
router.patch("/subjects/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const cur = await prisma.subject.findUniqueOrThrow({ where: { id: id(req.params.id) } });
  assertDept(req, cur.departmentId);
  res.json(await prisma.subject.update({ where: { id: cur.id }, data: SubjectSchema.omit({ departmentId: true }).partial().parse(req.body) }));
}));
router.delete("/subjects/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const cur = await prisma.subject.findUniqueOrThrow({ where: { id: id(req.params.id) } });
  assertDept(req, cur.departmentId);
  await prisma.subject.delete({ where: { id: cur.id } });
  res.status(204).end();
}));

// ── Sections and batches ────────────────────────────────────────────────────
const BatchSchema = z.object({ name: z.string().min(1).max(20), strength: z.number().int().min(1).max(1000) });
const SectionSchema = z.object({
  programId: z.number().int().positive(),
  semesterId: z.number().int().positive(),
  yearOfStudy: z.number().int().min(1).max(8),
  name: z.string().min(1).max(20),
  strength: z.number().int().min(1).max(2000),
  batches: z.array(BatchSchema).max(12).optional(),
});
async function sectionDept(sectionId: number) {
  const s = await prisma.section.findUniqueOrThrow({ where: { id: sectionId }, include: { program: { select: { departmentId: true } } } });
  return { section: s, departmentId: s.program.departmentId };
}
router.get("/sections", asyncHandler(async (req, res) => {
  const where = {
    semesterId: req.query.semesterId ? id(String(req.query.semesterId)) : undefined,
    programId: req.query.programId ? id(String(req.query.programId)) : undefined,
  };
  res.json({ items: await prisma.section.findMany({ where, orderBy: [{ programId: "asc" }, { yearOfStudy: "asc" }, { name: "asc" }], include: { program: { select: { code: true, departmentId: true } }, batches: { orderBy: { id: "asc" } }, _count: { select: { requirements: true } } } }) });
}));
router.post("/sections", requireRole("HOD"), asyncHandler(async (req, res) => {
  const { batches, ...b } = SectionSchema.parse(req.body);
  const prog = await prisma.program.findUniqueOrThrow({ where: { id: b.programId } });
  assertDept(req, prog.departmentId);
  if (batches?.some((x) => x.strength > b.strength)) throw new HttpError(422, "A batch cannot be larger than its section");
  res.status(201).json(await prisma.section.create({ data: { ...b, ...(batches?.length ? { batches: { create: batches } } : {}) }, include: { batches: true } }));
}));
router.patch("/sections/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const { section, departmentId } = await sectionDept(id(req.params.id));
  assertDept(req, departmentId);
  const b = z.object({ name: z.string().min(1).max(20), strength: z.number().int().min(1).max(2000), yearOfStudy: z.number().int().min(1).max(8) }).partial().parse(req.body);
  res.json(await prisma.section.update({ where: { id: section.id }, data: b }));
}));
router.delete("/sections/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const { section, departmentId } = await sectionDept(id(req.params.id));
  assertDept(req, departmentId);
  const used = await prisma.timetableEntry.count({ where: { sectionId: section.id } });
  if (used) throw new HttpError(409, `${used} timetable entries reference this section`);
  await prisma.section.delete({ where: { id: section.id } });
  res.status(204).end();
}));
router.post("/sections/:id/batches", requireRole("HOD"), asyncHandler(async (req, res) => {
  const { section, departmentId } = await sectionDept(id(req.params.id));
  assertDept(req, departmentId);
  const b = BatchSchema.parse(req.body);
  if (b.strength > section.strength) throw new HttpError(422, "A batch cannot be larger than its section");
  res.status(201).json(await prisma.sectionBatch.create({ data: { ...b, sectionId: section.id } }));
}));
router.patch("/sections/:id/batches/:bid", requireRole("HOD"), asyncHandler(async (req, res) => {
  const { departmentId } = await sectionDept(id(req.params.id));
  assertDept(req, departmentId);
  const b = BatchSchema.partial().parse(req.body);
  const batch = await prisma.sectionBatch.findFirst({ where: { id: id(req.params.bid), sectionId: id(req.params.id) } });
  if (!batch) throw new HttpError(404, "Batch not found");
  res.json(await prisma.sectionBatch.update({ where: { id: batch.id }, data: b }));
}));
router.delete("/sections/:id/batches/:bid", requireRole("HOD"), asyncHandler(async (req, res) => {
  const { departmentId } = await sectionDept(id(req.params.id));
  assertDept(req, departmentId);
  const n = await prisma.subjectRequirement.count({ where: { batchId: id(req.params.bid) } });
  if (n) throw new HttpError(409, `${n} requirement(s) target this batch; delete them first`);
  await prisma.sectionBatch.deleteMany({ where: { id: id(req.params.bid), sectionId: id(req.params.id) } });
  res.status(204).end();
}));

// ── Subject requirements ────────────────────────────────────────────────────
const ReqSchema = z.object({
  sectionId: z.number().int().positive(),
  batchId: z.number().int().positive().nullable().optional(),
  subjectId: z.number().int().positive(),
  assignedFacultyId: z.number().int().positive().nullable().optional(),
  sessionsPerWeek: z.number().int().min(1).max(12),
  blockLength: z.number().int().min(1).max(4).default(1),
  roomType: z.enum(["CLASSROOM", "LAB", "OTHER"]).default("CLASSROOM"),
  requiredEquipment: z.array(z.string().min(1).max(50)).max(20).default([]),
});
async function checkReq(b: z.infer<typeof ReqSchema>, selfId?: number) {
  const batch = b.batchId ? await prisma.sectionBatch.findUnique({ where: { id: b.batchId } }) : null;
  if (b.batchId && (!batch || batch.sectionId !== b.sectionId)) throw new HttpError(422, "The batch does not belong to this section");
  // NULL batch ids are distinct in a unique index, so uniqueness is enforced here.
  const dup = await prisma.subjectRequirement.findFirst({ where: { sectionId: b.sectionId, batchId: b.batchId ?? null, subjectId: b.subjectId, ...(selfId ? { id: { not: selfId } } : {}) } });
  if (dup) throw new HttpError(409, "This subject already has a requirement for that section/batch");
  if (b.assignedFacultyId) {
    const q = await prisma.facultySubject.findFirst({ where: { facultyProfileId: b.assignedFacultyId, subjectId: b.subjectId } });
    if (!q) throw new HttpError(422, "The assigned faculty is not qualified for this subject");
  }
}
router.get("/requirements", asyncHandler(async (req, res) => {
  const where = { sectionId: req.query.sectionId ? id(String(req.query.sectionId)) : undefined, section: req.query.semesterId ? { semesterId: id(String(req.query.semesterId)) } : undefined };
  res.json({ items: await prisma.subjectRequirement.findMany({ where, orderBy: [{ sectionId: "asc" }, { subjectId: "asc" }, { batchId: "asc" }], take: 2000, include: { subject: { select: { code: true, name: true, type: true } }, batch: { select: { name: true } }, assignedFaculty: { select: { id: true, user: { select: { name: true } } } } } }) });
}));
router.post("/requirements", requireRole("HOD"), asyncHandler(async (req, res) => {
  const b = ReqSchema.parse(req.body);
  assertDept(req, (await sectionDept(b.sectionId)).departmentId);
  await checkReq(b);
  res.status(201).json(await prisma.subjectRequirement.create({ data: { ...b, batchId: b.batchId ?? null } }));
}));
router.patch("/requirements/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const cur = await prisma.subjectRequirement.findUniqueOrThrow({ where: { id: id(req.params.id) } });
  assertDept(req, (await sectionDept(cur.sectionId)).departmentId);
  const b = ReqSchema.omit({ sectionId: true, batchId: true, subjectId: true }).partial().parse(req.body);
  await checkReq({ ...cur, ...b } as never, cur.id);
  res.json(await prisma.subjectRequirement.update({ where: { id: cur.id }, data: b }));
}));
router.delete("/requirements/:id", requireRole("HOD"), asyncHandler(async (req, res) => {
  const cur = await prisma.subjectRequirement.findUniqueOrThrow({ where: { id: id(req.params.id) } });
  assertDept(req, (await sectionDept(cur.sectionId)).departmentId);
  await prisma.subjectRequirement.delete({ where: { id: cur.id } });
  res.status(204).end();
}));
/** Create requirements for a section from the subjects' default sessions/block/room settings. */
router.post("/sections/:id/requirements/apply-defaults", requireRole("HOD"), asyncHandler(async (req, res) => {
  const { section, departmentId } = await sectionDept(id(req.params.id));
  assertDept(req, departmentId);
  const { subjectIds } = z.object({ subjectIds: z.array(z.number().int().positive()).min(1).max(100) }).parse(req.body);
  const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds } } });
  if (subjects.length !== new Set(subjectIds).size) throw new HttpError(404, "Some subjects were not found");
  const batches = await prisma.sectionBatch.findMany({ where: { sectionId: section.id } });
  const existing = await prisma.subjectRequirement.findMany({ where: { sectionId: section.id } });
  const has = (sub: number, batch: number | null) => existing.some((e) => e.subjectId === sub && e.batchId === batch);
  const data: any[] = [];
  const skipped: string[] = [];
  for (const s of subjects) {
    const base = { sectionId: section.id, subjectId: s.id, sessionsPerWeek: s.defaultSessionsPerWeek, blockLength: s.defaultBlockLength, roomType: s.requiredRoomType, requiredEquipment: s.requiredEquipment };
    if (s.type === "LAB" && batches.length) {
      for (const b of batches) (has(s.id, b.id) ? skipped.push(`${s.code}/${b.name}`) : data.push({ ...base, batchId: b.id }));
    } else if (has(s.id, null)) skipped.push(s.code);
    else data.push({ ...base, batchId: null });
  }
  if (data.length) await prisma.subjectRequirement.createMany({ data });
  res.status(201).json({ created: data.length, skipped });
}));

// ── Faculty profiles, qualifications, availability ──────────────────────────
router.get("/faculty-profiles", asyncHandler(async (req, res) => {
  const departmentId = req.query.departmentId ? id(String(req.query.departmentId)) : undefined;
  const items = await prisma.facultyProfile.findMany({
    where: { user: { isDeleted: false, departmentId } }, orderBy: { id: "asc" },
    include: { user: { select: { id: true, name: true, email: true, role: true, departmentId: true } }, qualifications: { select: { subjectId: true } } },
  });
  const withoutProfile = await prisma.user.findMany({ where: { isDeleted: false, departmentId, facultyProfile: null }, select: { id: true, name: true, email: true, role: true, departmentId: true }, orderBy: { name: "asc" } });
  res.json({ items, usersWithoutProfile: withoutProfile });
}));
async function profileAccess(req: Request, profileId: number) {
  const p = await prisma.facultyProfile.findUniqueOrThrow({ where: { id: profileId }, include: { user: { select: { departmentId: true, id: true } } } });
  const self = p.user.id === req.user!.id;
  if (!self) {
    if (HIERARCHY[req.user!.role] < HIERARCHY.COORDINATOR) throw new HttpError(403, "Insufficient permissions");
    assertDept(req, p.user.departmentId);
  }
  return p;
}
router.post("/faculty-profiles", requireRole("COORDINATOR"), asyncHandler(async (req, res) => {
  const b = z.object({ userId: z.number().int().positive(), employeeCode: z.string().max(30).nullable().optional(), designation: z.string().max(100).nullable().optional(), maxPeriodsPerWeek: z.number().int().min(1).max(60).optional(), maxConsecutive: z.number().int().min(1).max(8).optional() }).parse(req.body);
  const u = await prisma.user.findFirst({ where: { id: b.userId, isDeleted: false } });
  if (!u) throw new HttpError(404, "User not found");
  assertDept(req, u.departmentId);
  res.status(201).json(await prisma.facultyProfile.create({ data: b }));
}));
router.patch("/faculty-profiles/:id", asyncHandler(async (req, res) => {
  const p = await profileAccess(req, id(req.params.id));
  const b = z.object({ employeeCode: z.string().max(30).nullable(), designation: z.string().max(100).nullable(), maxPeriodsPerWeek: z.number().int().min(1).max(60), maxConsecutive: z.number().int().min(1).max(8) }).partial().parse(req.body);
  res.json(await prisma.facultyProfile.update({ where: { id: p.id }, data: b }));
}));
router.put("/faculty-profiles/:id/qualifications", requireRole("COORDINATOR"), asyncHandler(async (req, res) => {
  const p = await profileAccess(req, id(req.params.id));
  const { subjectIds } = z.object({ subjectIds: z.array(z.number().int().positive()).max(300) }).parse(req.body);
  const ids = [...new Set(subjectIds)];
  const found = await prisma.subject.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new HttpError(404, "Some subjects were not found");
  await prisma.$transaction([
    prisma.facultySubject.deleteMany({ where: { facultyProfileId: p.id } }),
    prisma.facultySubject.createMany({ data: ids.map((subjectId) => ({ facultyProfileId: p.id, subjectId })) }),
  ]);
  res.json({ subjectIds: ids });
}));
const AvailabilitySchema = z.object({
  semesterId: z.number().int().positive(),
  slots: z.array(z.object({ day: Day, periodIndex: z.number().int().min(0).max(30), kind: z.enum(["UNAVAILABLE", "PREFERRED"]) })).max(400),
});
async function checkSlots(semesterId: number, slots: { day: string; periodIndex: number }[]) {
  const sem = await prisma.semester.findUnique({ where: { id: semesterId }, include: { periods: true } });
  if (!sem) throw new HttpError(404, "Semester not found");
  const idx = new Set(sem.periods.map((p) => p.index));
  for (const s of slots) {
    if (!sem.workingDays.includes(s.day as never)) throw new HttpError(422, `${s.day} is not a working day of this semester`);
    if (!idx.has(s.periodIndex)) throw new HttpError(422, `Period ${s.periodIndex} does not exist in this semester`);
  }
  const seen = new Set<string>();
  for (const s of slots) { const k = `${s.day}|${s.periodIndex}`; if (seen.has(k)) throw new HttpError(422, `Duplicate slot ${k}`); seen.add(k); }
}
router.get("/faculty-profiles/:id/availability", asyncHandler(async (req, res) => {
  const p = await profileAccess(req, id(req.params.id)).catch((e) => { if (e instanceof HttpError && e.status === 403 && HIERARCHY[req.user!.role] >= 1) return null; throw e; });
  const semesterId = id(String(req.query.semesterId));
  const items = await prisma.facultyAvailability.findMany({ where: { facultyProfileId: p?.id ?? id(req.params.id), semesterId } });
  res.json({ items });
}));
router.put("/faculty-profiles/:id/availability", asyncHandler(async (req, res) => {
  const p = await profileAccess(req, id(req.params.id));
  const b = AvailabilitySchema.parse(req.body);
  await checkSlots(b.semesterId, b.slots);
  await prisma.$transaction([
    prisma.facultyAvailability.deleteMany({ where: { facultyProfileId: p.id, semesterId: b.semesterId } }),
    prisma.facultyAvailability.createMany({ data: b.slots.map((s) => ({ facultyProfileId: p.id, semesterId: b.semesterId, day: s.day as never, periodIndex: s.periodIndex, kind: s.kind })) }),
  ]);
  res.json({ count: b.slots.length });
}));

// ── Room availability ───────────────────────────────────────────────────────
router.get("/rooms/:id/availability", asyncHandler(async (req, res) => {
  const semesterId = id(String(req.query.semesterId));
  res.json({ items: await prisma.roomAvailability.findMany({ where: { roomId: id(req.params.id), semesterId } }) });
}));
router.put("/rooms/:id/availability", requireRole("COORDINATOR"), asyncHandler(async (req, res) => {
  const room = await prisma.room.findUniqueOrThrow({ where: { id: id(req.params.id) } });
  assertDept(req, room.departmentId);
  const b = z.object({ semesterId: z.number().int().positive(), slots: z.array(z.object({ day: Day, periodIndex: z.number().int().min(0).max(30) })).max(400) }).parse(req.body);
  await checkSlots(b.semesterId, b.slots);
  await prisma.$transaction([
    prisma.roomAvailability.deleteMany({ where: { roomId: room.id, semesterId: b.semesterId } }),
    prisma.roomAvailability.createMany({ data: b.slots.map((s) => ({ roomId: room.id, semesterId: b.semesterId, day: s.day as never, periodIndex: s.periodIndex })) }),
  ]);
  res.json({ count: b.slots.length });
}));

export default router;
