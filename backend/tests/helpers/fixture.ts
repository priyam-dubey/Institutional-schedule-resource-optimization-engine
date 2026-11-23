/** Seeds a small but realistic institution through the real Prisma client. */
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

export interface SeedOpts {
  sections?: number;
  teachersPerSubject?: number;
  subjects?: number; // theory subjects per section
  labRooms?: number;
  classrooms?: number;
  sessions?: number;
}

export async function seedBasic(prisma: any, o: SeedOpts = {}) {
  const nSections = o.sections ?? 2;
  const nSubjects = o.subjects ?? 4;
  const teachers = o.teachersPerSubject ?? 2;

  const inst = await prisma.institution.create({ data: { name: "Test Institute", code: "TI" } });
  const dept = await prisma.department.create({ data: { name: "Computer Science", code: "CSE", institutionId: inst.id } });
  const dept2 = await prisma.department.create({ data: { name: "Mechanical", code: "ME", institutionId: inst.id } });
  const program = await prisma.program.create({ data: { departmentId: dept.id, code: "BTECH", name: "B.Tech CSE" } });
  const year = await prisma.academicYear.create({
    data: { institutionId: inst.id, label: "2026-27", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), isCurrent: true },
  });
  const semester = await prisma.semester.create({
    data: {
      academicYearId: year.id, name: "Odd", startDate: new Date("2026-07-15"), endDate: new Date("2026-12-15"),
      workingDays: DAYS,
      periods: {
        create: [
          { index: 0, label: "I", startTime: "09:00", endTime: "09:50" },
          { index: 1, label: "II", startTime: "09:50", endTime: "10:40" },
          { index: 2, label: "III", startTime: "10:40", endTime: "11:30" },
          { index: 3, label: "Break", startTime: "11:30", endTime: "12:00", isBreak: true },
          { index: 4, label: "IV", startTime: "12:00", endTime: "12:50" },
          { index: 5, label: "V", startTime: "12:50", endTime: "13:40" },
          { index: 6, label: "VI", startTime: "13:40", endTime: "14:30" },
        ],
      },
    },
  });

  const rooms: any[] = [];
  for (let i = 0; i < (o.classrooms ?? 3); i++) {
    rooms.push(await prisma.room.create({ data: { roomNumber: `C${100 + i}`, departmentId: dept.id, capacity: 70, type: "CLASSROOM" } }));
  }
  for (let i = 0; i < (o.labRooms ?? 2); i++) {
    rooms.push(await prisma.room.create({ data: { roomNumber: `L${i + 1}`, departmentId: dept.id, capacity: 35, type: "LAB", equipment: ["computers"] } }));
  }

  const users: any[] = [];
  const profiles: any[] = [];
  const subjects: any[] = [];
  const mkUser = async (name: string, role: string, departmentId: number) =>
    prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W+/g, ".")}@ti.test`, passwordHash: "x".repeat(60), role, departmentId } });

  for (let s = 0; s < nSubjects; s++) {
    const subj = await prisma.subject.create({
      data: { departmentId: dept.id, code: `CS${200 + s}`, name: `Subject ${s}`, credits: 3, type: "LECTURE", defaultSessionsPerWeek: o.sessions ?? 3 },
    });
    subjects.push(subj);
    for (let t = 0; t < teachers; t++) {
      const u = await mkUser(`Prof S${s} T${t}`, "PROFESSOR", dept.id);
      const fp = await prisma.facultyProfile.create({ data: { userId: u.id, maxPeriodsPerWeek: 18 } });
      await prisma.facultySubject.create({ data: { facultyProfileId: fp.id, subjectId: subj.id } });
      users.push(u);
      profiles.push(fp);
    }
  }
  const lab = await prisma.subject.create({
    data: { departmentId: dept.id, code: "CS290", name: "Programming Lab", credits: 2, type: "LAB", defaultSessionsPerWeek: 1, defaultBlockLength: 2, requiredRoomType: "LAB", requiredEquipment: ["computers"] },
  });
  subjects.push(lab);
  const labU = await mkUser("Lab Instructor", "PROFESSOR", dept.id);
  const labFp = await prisma.facultyProfile.create({ data: { userId: labU.id } });
  await prisma.facultySubject.create({ data: { facultyProfileId: labFp.id, subjectId: lab.id } });
  profiles.push(labFp);
  users.push(labU);

  const sections: any[] = [];
  for (let i = 0; i < nSections; i++) {
    const sec = await prisma.section.create({
      data: {
        programId: program.id, semesterId: semester.id, yearOfStudy: 2, name: String.fromCharCode(65 + i), strength: 60,
        batches: { create: [{ name: "B1", strength: 30 }, { name: "B2", strength: 30 }] },
      },
      include: { batches: true },
    });
    sections.push(sec);
    for (const subj of subjects.slice(0, nSubjects)) {
      await prisma.subjectRequirement.create({
        data: { sectionId: sec.id, subjectId: subj.id, sessionsPerWeek: o.sessions ?? 3, blockLength: 1, roomType: "CLASSROOM" },
      });
    }
    for (const b of sec.batches) {
      await prisma.subjectRequirement.create({
        data: { sectionId: sec.id, batchId: b.id, subjectId: lab.id, sessionsPerWeek: 1, blockLength: 2, roomType: "LAB", requiredEquipment: ["computers"] },
      });
    }
  }
  const admin = await mkUser("Admin One", "ADMIN", dept.id);
  const dean = await mkUser("Dean One", "DEAN", dept.id);
  const hod = await mkUser("Hod One", "HOD", dept.id);
  const hodOther = await mkUser("Hod Mech", "HOD", dept2.id);
  const prof = users[0];
  return { inst, dept, dept2, program, year, semester, rooms, users, profiles, subjects, lab, sections, admin, dean, hod, hodOther, prof };
}
