/**
 * Prisma Seed
 * Bootstraps the database with BIT Mesra CSE department data
 * derived from the uploaded Spring 2026 timetable PDFs.
 * Run: npm run prisma:seed
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();



async function main() {
  // No credential is committed to the repo. Provide SEED_PASSWORD, or a random one is generated and printed once.
  const seedPassword = process.env.SEED_PASSWORD ?? crypto.randomBytes(12).toString("base64url");
  const defaultHash = await bcrypt.hash(seedPassword, 12);
  console.log("Seeding Samayak database...");

  // ── Departments ─────────────────────────────────────────────────────────────
  const cse = await prisma.department.upsert({
    where: { code: "CSE" },
    create: { name: "Computer Science & Engineering", code: "CSE" },
    update: {},
  });
  const ece = await prisma.department.upsert({
    where: { code: "ECE" },
    create: { name: "Electronics & Communication Engineering", code: "ECE" },
    update: {},
  });
  const hss = await prisma.department.upsert({
    where: { code: "HSS" },
    create: { name: "Humanities & Social Sciences", code: "HSS" },
    update: {},
  });
  const math = await prisma.department.upsert({
    where: { code: "MATH" },
    create: { name: "Mathematics Department", code: "MATH" },
    update: {},
  });

  console.log("Departments seeded");

  // ── Branches ────────────────────────────────────────────────────────────────
  const branchCS = await prisma.branch.upsert({
    where: { code_departmentId: { code: "CS", departmentId: cse.id } },
    create: { name: "Computer Science", code: "CS", departmentId: cse.id },
    update: {},
  });
  const branchAIML = await prisma.branch.upsert({
    where: { code_departmentId: { code: "AIML", departmentId: cse.id } },
    create: { name: "Artificial Intelligence & Machine Learning", code: "AIML", departmentId: cse.id },
    update: {},
  });
  const branchIT = await prisma.branch.upsert({
    where: { code_departmentId: { code: "IT", departmentId: cse.id } },
    create: { name: "Information Technology", code: "IT", departmentId: cse.id },
    update: {},
  });

  console.log("Branches seeded");

  // ── Rooms (from BIT Mesra timetable images) ──────────────────────────────────
  const roomDefs = [
    { roomNumber: "219",   departmentId: cse.id,  capacity: 60, type: "CLASSROOM" },
    { roomNumber: "220",   departmentId: cse.id,  capacity: 60, type: "CLASSROOM" },
    { roomNumber: "213",   departmentId: cse.id,  capacity: 60, type: "CLASSROOM" },
    { roomNumber: "216 A", departmentId: cse.id,  capacity: 60, type: "CLASSROOM" },
    { roomNumber: "Lab 3", departmentId: cse.id,  capacity: 30, type: "LAB" },
    { roomNumber: "Lab 4", departmentId: cse.id,  capacity: 30, type: "LAB" },
    { roomNumber: "Lab 6", departmentId: cse.id,  capacity: 30, type: "LAB" },
    { roomNumber: "G2",    departmentId: ece.id,  capacity: 80, type: "CLASSROOM" },
    { roomNumber: "G3",    departmentId: ece.id,  capacity: 80, type: "CLASSROOM" },
  ] as const;

  for (const r of roomDefs) {
    await prisma.room.upsert({
      where: { roomNumber_departmentId: { roomNumber: r.roomNumber, departmentId: r.departmentId } },
      create: r as any,
      update: {},
    });
  }
  console.log("Rooms seeded");

  // ── Courses — CS Branch Semester VI (from timetable image 1) ─────────────────
  const csCourses = [
    { code: "CS333", name: "Compiler Design",                                    credits: 4.0,  type: "LECTURE" },
    { code: "CS335", name: "Artificial Intelligence and Machine Learning",        credits: 4.0,  type: "LECTURE" },
    { code: "CS336", name: "Artificial Intelligence & Machine Learning Lab",      credits: 1.5,  type: "LAB"     },
    { code: "CS334", name: "Compiler Design Lab",                                 credits: 1.5,  type: "LAB"     },
    { code: "CS338", name: "Embedded System Lab",                                 credits: 1.5,  type: "LAB"     },
    { code: "IT349", name: "Cryptography and Network Security",                   credits: 3.0,  type: "LECTURE" },
    { code: "IT353", name: "Blockchain Technology",                               credits: 3.0,  type: "LECTURE" },
    { code: "MT204", name: "Constitution of India",                               credits: 0.0,  type: "LECTURE" },
    { code: "MT133", name: "Communications Skills II (CS-II)",                    credits: 1.5,  type: "LECTURE" },
    { code: "MC300", name: "Summer Training",                                     credits: 2.0,  type: "LECTURE" },
  ];

  for (const c of csCourses) {
    await prisma.course.upsert({
      where: { code_branchId_semester: { code: c.code, branchId: branchCS.id, semester: 6 } },
      create: { ...c, branchId: branchCS.id, semester: 6, type: c.type as any },
      update: { name: c.name },
    });
  }

  // ── Courses — AIML Branch Semester VI (from timetable image 2) ───────────────
  const aimlCourses = [
    { code: "AI303", name: "UnSupervised Learning",               credits: 3.0, type: "LECTURE" },
    { code: "AI305", name: "Deep Learning",                       credits: 3.0, type: "LECTURE" },
    { code: "AI307", name: "Modern AI",                           credits: 3.0, type: "LECTURE" },
    { code: "AI317", name: "Information Retrieval",               credits: 3.0, type: "LECTURE" },
    { code: "AI321", name: "Data Mining",                         credits: 3.0, type: "LECTURE" },
    { code: "AI304", name: "UnSupervised Learning Lab",           credits: 1.5, type: "LAB"     },
    { code: "AI306", name: "Deep Learning Lab",                   credits: 1.5, type: "LAB"     },
    { code: "MT204", name: "Constitution of India",               credits: 0.0, type: "LECTURE" },
    { code: "MT133", name: "Communications Skills II (CS-II)",    credits: 1.5, type: "LECTURE" },
  ];

  for (const c of aimlCourses) {
    await prisma.course.upsert({
      where: { code_branchId_semester: { code: c.code, branchId: branchAIML.id, semester: 6 } },
      create: { ...c, branchId: branchAIML.id, semester: 6, type: c.type as any },
      update: { name: c.name },
    });
  }

  console.log("Courses seeded");

  // ── Faculty (from timetable legends) 
  // facultyDefs upsert─────────────────────────────────────────
  const facultyDefs = [
    { name: "Prof. Supratim Biswas",     email: "supratim.b@bitmesra.ac.in",    role: "HOD",         departmentId: cse.id  },
    { name: "Dr. Sanchita Paul",         email: "sanchita.paul@bitmesra.ac.in", role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Dr. Subrajeet Mohapatra",   email: "subrajeet.m@bitmesra.ac.in",   role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Dr. Monu Bhagat",           email: "monu.b@bitmesra.ac.in",        role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Prof. Abhijit Mustafi",     email: "abhijit.m@bitmesra.ac.in",     role: "COORDINATOR", departmentId: cse.id  },
    { name: "Dr. Satish Chander",        email: "satish.c@bitmesra.ac.in",      role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Dr. Saikat Chakraborty",    email: "saikat.c@bitmesra.ac.in",      role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Dr. K. S. Patnaik",         email: "ks.patnaik@bitmesra.ac.in",    role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Dr. Sumit Srivastava",      email: "sumit.s@bitmesra.ac.in",       role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Dr. Ravi Sankar Mehta",     email: "ravi.m@bitmesra.ac.in",        role: "PROFESSOR",   departmentId: cse.id  },
    { name: "Dr. R. N. Bhagat",          email: "rn.bhagat@bitmesra.ac.in",     role: "PROFESSOR",   departmentId: hss.id  },
    { name: "Jyoti Kumari",              email: "jyoti.k@bitmesra.ac.in",       role: "PROFESSOR",   departmentId: hss.id  },
    { name: "Dr. Anand Kumar",           email: "anand.k@bitmesra.ac.in",       role: "PROFESSOR",   departmentId: hss.id  },
    { name: "Prem Prakash",              email: "prem.p@bitmesra.ac.in",        role: "COORDINATOR", departmentId: cse.id  },
    { name: "Dr. Gautam Sarkhel",        email: "gautam.s@bitmesra.ac.in",      role: "DEAN",        departmentId: cse.id  },
  ];

  for (const f of facultyDefs) {
    await prisma.user.upsert({
      where: { email: f.email },
      create: { ...f, role: f.role as any, passwordHash: defaultHash },
      update: { name: f.name },
    });
  }

  console.log("Faculty seeded");

  // Bootstrap administrator (needed to log in at all).
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.edu").toLowerCase();
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { name: "System Administrator", email: adminEmail, role: "ADMIN", departmentId: cse.id, passwordHash: defaultHash },
    update: {},
  });
  console.log("Admin account: " + adminEmail);
  if (!process.env.SEED_PASSWORD) console.log("Generated password for ALL seeded accounts (shown once): " + seedPassword);
  console.log("Seed complete.");
}

main()
  .catch(e => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
