/**
 * BullMQ Worker: csv-import
 * Handles bulk CSV/Excel import for departments, rooms, courses, and users.
 * Runs in a separate process — never blocks the API event loop.
 */
import { Worker, Job } from "bullmq";
import { parse } from "csv-parse/sync";
import * as xlsx from "xlsx";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { resolveInstitutionId } from "../lib/institution";
import { getRedis } from "../lib/redis";
import { analyticsQueue } from "../lib/queues";
import type { CsvImportJobData } from "../lib/queues";

interface ParsedRow { [key: string]: string }

function parseFile(filePath: string): ParsedRow[] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    const content = fs.readFileSync(filePath, "utf-8");
    return parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } else if (ext === ".xlsx" || ext === ".xls") {
    const wb = xlsx.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return xlsx.utils.sheet_to_json<ParsedRow>(ws, { defval: "" });
  }
  throw new Error("Unsupported file format: " + ext);
}

type ImportResult = {
  created: number;
  skipped: number;
  failed: number;
  errors: { row: number; data: ParsedRow; reason: string }[];
};

async function importDepartments(rows: ParsedRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || !row.code) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: "name and code are required" });
      continue;
    }
    try {
      await prisma.department.upsert({
        where: { code: row.code.toUpperCase() },
        create: { name: row.name.trim(), code: row.code.toUpperCase().trim(), institutionId: await resolveInstitutionId() },
        update: { name: row.name.trim() },
      });
      result.created++;
    } catch (e: any) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: e.message });
    }
  }
  return result;
}

async function importRooms(rows: ParsedRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.room_number || !row.department_code) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: "room_number and department_code required" });
      continue;
    }
    try {
      const dept = await prisma.department.findUnique({ where: { code: row.department_code.toUpperCase() } });
      if (!dept) throw new Error("Department '" + row.department_code + "' not found");
      const capacity = row.capacity ? Number(row.capacity) : null;
      if (capacity !== null && isNaN(capacity)) throw new Error("capacity must be a number");
      await prisma.room.upsert({
        where: { roomNumber_departmentId: { roomNumber: row.room_number.trim(), departmentId: dept.id } },
        create: {
          roomNumber: row.room_number.trim(),
          departmentId: dept.id,
          capacity,
          type: ((row.type || "CLASSROOM").toUpperCase()) as any,
        },
        update: { capacity, type: ((row.type || "CLASSROOM").toUpperCase()) as any },
      });
      result.created++;
    } catch (e: any) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: e.message });
    }
  }
  return result;
}

async function importCourses(rows: ParsedRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.code || !row.name || !row.branch_code) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: "code, name, branch_code required" });
      continue;
    }
    try {
      const branch = await prisma.branch.findFirst({ where: { code: row.branch_code.toUpperCase() } });
      if (!branch) throw new Error("Branch '" + row.branch_code + "' not found");
      const credits = parseFloat(row.credits ?? "0");
      if (isNaN(credits)) throw new Error("credits must be numeric");
      const semester = parseInt(row.semester ?? "1");
      await prisma.course.upsert({
        where: { code_branchId_semester: { code: row.code.trim(), branchId: branch.id, semester } },
        create: {
          code: row.code.trim(),
          name: row.name.trim(),
          credits,
          type: ((row.type || "LECTURE").toUpperCase()) as any,
          branchId: branch.id,
          semester,
        },
        update: { name: row.name.trim(), credits },
      });
      result.created++;
    } catch (e: any) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: e.message });
    }
  }
  return result;
}

async function importUsers(rows: ParsedRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, failed: 0, errors: [] };
  const validRoles = new Set(["ADMIN", "DEAN", "HOD", "COORDINATOR", "PROFESSOR"]);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || !row.email || !row.department_code) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: "name, email, department_code required" });
      continue;
    }
    const role = (row.role || "PROFESSOR").toUpperCase();
    if (!validRoles.has(role)) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: "Invalid role: " + row.role });
      continue;
    }
    try {
      const dept = await prisma.department.findUnique({ where: { code: row.department_code.toUpperCase() } });
      if (!dept) throw new Error("Department '" + row.department_code + "' not found");
      await prisma.user.upsert({
        where: { email: row.email.toLowerCase().trim() },
        // Imported accounts get an unguessable password nobody knows; an ADMIN issues a real one via PUT /api/users/:id/password.
        create: { name: row.name.trim(), email: row.email.toLowerCase().trim(), role: role as any, departmentId: dept.id, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("base64url"), 10) },
        update: { name: row.name.trim(), role: role as any },
      });
      result.created++;
    } catch (e: any) {
      result.failed++;
      result.errors.push({ row: i + 2, data: row, reason: e.message });
    }
  }
  return result;
}

const worker = new Worker<CsvImportJobData>(
  "csv-import",
  async (job: Job<CsvImportJobData>) => {
    const { jobId, filePath, entity } = job.data;
    console.log("[csv-worker] Starting " + entity + " import. jobId=" + jobId);
    await prisma.ingestionJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });
    try {
      const rows = parseFile(filePath);
      await prisma.ingestionJob.update({ where: { id: jobId }, data: { totalRows: rows.length } });
      let result: ImportResult;
      switch (entity) {
        case "departments": result = await importDepartments(rows); break;
        case "rooms":       result = await importRooms(rows);       break;
        case "courses":     result = await importCourses(rows);     break;
        case "users":       result = await importUsers(rows);       break;
        default: throw new Error("Unknown entity type: " + entity);
      }
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          createdRows: result.created,
          failedRows: result.failed,
          errorLog: result.errors as any,
          completedAt: new Date(),
        },
      });
      await analyticsQueue.add("recompute", { trigger: "ingestion-complete", entityType: entity });
      console.log("[csv-worker] Done. created=" + result.created + " failed=" + result.failed);
    } catch (err: any) {
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: { status: "FAILED", errorLog: [{ reason: err.message }] as any, completedAt: new Date() },
      });
      throw err;
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  },
  { connection: getRedis(), concurrency: 2 }
);

worker.on("failed", (job, err) =>
  console.error("[csv-worker] Job " + job?.id + " failed:", err.message)
);
console.log("[csv-worker] Listening on csv-import queue");
