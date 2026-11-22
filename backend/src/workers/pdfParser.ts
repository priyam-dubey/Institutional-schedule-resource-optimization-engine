/**
 * BullMQ Worker: pdf-parse
 *
 * Generic structural parser for BIT Mesra timetable PDFs.
 * Handles any department — CSE, ECE, ME, CE — without hardcoded logic.
 *
 * Pipeline:
 *  1. Extract text items + XY positions via pdfjs-dist
 *  2. Group items into logical rows by Y-coordinate bucketing
 *  3. Auto-detect metadata: Dept, Branch, Semester from header rows
 *  4. Locate period-header row; build column-X → Period map
 *  5. Iterate day rows; tokenize cells into (course_abbr, room_code) pairs
 *  6. Resolve courses via exact code match + Levenshtein fallback
 *  7. Resolve/create rooms; split composite "X/Y" cells gracefully
 *  8. Upsert TimetableSlot records with conflict detection
 *  9. Enqueue analytics-recompute job → triggers live dashboard refresh
 */
import { Worker, Job } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { analyticsQueue } from "../lib/queues";
import type { PdfParseJobData } from "../lib/queues";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
type DayEnum = typeof DAYS[number];

const PERIOD_LABELS = ["I", "II", "III", "IV", "V", "VII", "VIII", "IX"] as const;
type PeriodEnum = typeof PERIOD_LABELS[number];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/**
 * Parse a timetable cell text into one or more (abbr, room) pairs.
 * Handles patterns like: "CD(G3)", "AIML Lab (Lab 3)", "CNS(219/220)BCT(G2/G3)", "OE III"
 */
function parseCellTokens(cell: string): { abbr: string; room: string | null }[] {
  cell = cell.trim();
  if (!cell || /^[-–—\s]+$/.test(cell)) return [];
  if (/lunch|break/i.test(cell)) return [];

  const results: { abbr: string; room: string | null }[] = [];

  // Split on boundaries between capital-letter sequences (handles merged cells)
  // e.g. "CNS(219/220)BCT(G2/G3)" → ["CNS(219/220)", "BCT(G2/G3)"]
  const segments = cell.split(/(?<=[)\s])(?=[A-Z]{2})/g);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([A-Za-z][A-Za-z0-9\s\-]+?)\s*(?:\(([^)]+)\))?$/);
    if (m) {
      results.push({ abbr: m[1].trim(), room: m[2]?.trim() ?? null });
    } else {
      // fallback: treat whole segment as abbr with no room
      results.push({ abbr: trimmed.replace(/\([^)]*\)/g, "").trim(), room: null });
    }
  }

  return results.filter(r => r.abbr.length >= 2);
}

/** Find a course in DB by abbreviation with Levenshtein fallback */
async function resolveCourse(abbr: string, branchId: number) {
  const courses = await prisma.course.findMany({ where: { branchId } });
  const upper = abbr.toUpperCase().replace(/\s+/g, "");

  // Exact match on code
  const exact = courses.find(c => c.code.toUpperCase() === upper);
  if (exact) return exact;

  // Partial match: abbr is a substring of code (e.g. "CD" in "CS333-CD")
  const partial = courses.find(c => c.code.toUpperCase().includes(upper) || upper.includes(c.code.toUpperCase()));
  if (partial) return partial;

  // Fuzzy match within Levenshtein distance 3
  let best: (typeof courses)[number] | null = null;
  let bestDist = 4;
  for (const c of courses) {
    const d = levenshtein(upper, c.code.toUpperCase());
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

/** Resolve or create a room record; handles composite "219/220" → "219" + warning */
async function resolveOrCreateRoom(
  roomCode: string,
  departmentId: number,
  isLab: boolean,
  errors: { reason: string; context: string }[],
  context: string
) {
  const parts = roomCode.split("/").map(p => p.trim());
  const primaryCode = parts[0];

  if (parts.length > 1) {
    errors.push({
      reason: "Composite room '" + roomCode + "' detected; using primary room '" + primaryCode + "' only",
      context,
    });
  }

  const existing = await prisma.room.findUnique({
    where: { roomNumber_departmentId: { roomNumber: primaryCode, departmentId } },
  });
  if (existing) return existing;

  return prisma.room.create({
    data: {
      roomNumber: primaryCode,
      departmentId,
      type: isLab ? "LAB" : "CLASSROOM",
    },
  });
}

// ─── WORKER ───────────────────────────────────────────────────────────────────

const worker = new Worker<PdfParseJobData>(
  "pdf-parse",
  async (job: Job<PdfParseJobData>) => {
    const { jobId, filePath } = job.data;
    const errors: { reason: string; context: string }[] = [];
    let created = 0, matched = 0;

    await prisma.ingestionJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });

    try {
      // ── 1. Extract text items from PDF ──────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

      interface TextItem { str: string; x: number; y: number }
      const allItems: TextItem[] = [];

      const loadTask = pdfjsLib.getDocument({ url: filePath, verbosity: 0 });
      const pdfDoc = await loadTask.promise;

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const content = await page.getTextContent();
        for (const item of content.items as any[]) {
          if (item.str?.trim()) {
            allItems.push({ str: item.str.trim(), x: item.transform[4], y: item.transform[5] });
          }
        }
      }

      if (allItems.length === 0) throw new Error("No text content extracted from PDF");

      // ── 2. Group items into rows by Y-coordinate (bucket size = 8pt) ───────
      const rowBuckets = new Map<number, TextItem[]>();
      for (const item of allItems) {
        const key = Math.round(item.y / 8) * 8;
        if (!rowBuckets.has(key)) rowBuckets.set(key, []);
        rowBuckets.get(key)!.push(item);
      }

      // Sort rows top-to-bottom (descending Y in PDF coordinates)
      const sortedRows = [...rowBuckets.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) => items.sort((a, b) => a.x - b.x));

      // ── 3. Extract metadata: Department, Branch, Semester ────────────────────
      let branch = "";
      let semester = 6;
      let departmentId: number | null = null;

      for (const rowItems of sortedRows) {
        const line = rowItems.map(i => i.str).join(" ");
        const branchM = line.match(/Branch[:\s]+([A-Z]+)/i);
        const semM = line.match(/Semester[:\s]*([IVX\d]+\s*[A-Z]?)/i);
        const deptM = line.match(/Department[:\s]+([A-Z]+)/i);

        if (branchM && !branch) branch = branchM[1].toUpperCase().trim();
        if (semM && semester === 6) {
          const raw = semM[1].trim();
          const n = parseInt(raw, 10);
          if (!isNaN(n)) semester = n;
        }
        if (deptM && !departmentId) {
          const deptCode = deptM[1].toUpperCase().trim();
          const deptRecord = await prisma.department.findUnique({ where: { code: deptCode } });
          if (deptRecord) departmentId = deptRecord.id;
        }
      }

      if (!branch) throw new Error("Could not detect Branch from PDF metadata");

      const branchRecord = await prisma.branch.findFirst({
        where: { code: branch },
        include: { department: true },
      });

      if (!branchRecord) {
        throw new Error(
          "Branch '" + branch + "' not found in DB. " +
          "Ensure the branch is seeded before ingesting this PDF."
        );
      }

      const resolvedDeptId = departmentId ?? branchRecord.departmentId;

      // ── 4. Locate period-header row; build column-X → Period map ─────────────
      const periodColumnMap = new Map<number, PeriodEnum>();

      for (const rowItems of sortedRows) {
        const labels = rowItems.map(i => i.str.trim());
        const matchCount = PERIOD_LABELS.filter(p => labels.includes(p)).length;
        if (matchCount >= 3) {
          for (const item of rowItems) {
            const p = PERIOD_LABELS.find(pl => pl === item.str.trim());
            if (p) {
              // Bucket X to nearest 10pt to tolerate slight column drift
              periodColumnMap.set(Math.round(item.x / 10) * 10, p);
            }
          }
          break; // Found the period header row
        }
      }

      if (periodColumnMap.size === 0) {
        throw new Error("Could not detect period header row. Ensure PDF has columns I–IX.");
      }

      // ── 5. Parse day rows ─────────────────────────────────────────────────────
      for (const rowItems of sortedRows) {
        const dayItem = rowItems.find(i =>
          DAYS.includes(i.str.toUpperCase() as DayEnum)
        );
        if (!dayItem) continue;

        const day = dayItem.str.toUpperCase() as DayEnum;

        // Iterate non-day items in this row and map to periods
        for (const item of rowItems) {
          if (item === dayItem || item.str.length < 2) continue;

          const colKey = Math.round(item.x / 10) * 10;
          const period = periodColumnMap.get(colKey);
          if (!period) continue;

          const context = day + "·" + period;
          const tokens = parseCellTokens(item.str);

          for (const { abbr, room: roomCode } of tokens) {
            if (!abbr || abbr.length < 2) continue;

            // ── 6. Resolve course ─────────────────────────────────────────────
            const course = await resolveCourse(abbr, branchRecord.id);
            if (!course) {
              errors.push({ reason: "Cannot resolve course abbreviation '" + abbr + "'", context });
              continue;
            }

            // ── 7. Resolve room ───────────────────────────────────────────────
            let roomRecord = null;

            if (roomCode) {
              const isLab = abbr.toLowerCase().includes("lab") || course.type === "LAB";
              try {
                roomRecord = await resolveOrCreateRoom(roomCode, resolvedDeptId, isLab, errors, context);
              } catch (e: any) {
                errors.push({ reason: "Room resolution failed: " + e.message, context });
                continue;
              }
            } else {
              // No room code in cell — try to find any room for this dept as placeholder
              roomRecord = await prisma.room.findFirst({ where: { departmentId: resolvedDeptId } });
              if (!roomRecord) {
                errors.push({ reason: "No room code for '" + abbr + "' and no fallback room available", context });
                continue;
              }
            }

            // Inherit faculty from an existing slot for this course if available
            const existingFacultySlot = await prisma.timetableSlot.findFirst({
              where: { courseId: course.id, facultyId: { not: null } },
              select: { facultyId: true },
            });

            // ── 8. Upsert TimetableSlot ───────────────────────────────────────
            try {
              const conflict = await prisma.timetableSlot.findFirst({
                where: {
                  roomId: roomRecord.id,
                  dayOfWeek: day as any,
                  period: period as any,
                  semester,
                  branch,
                },
              });

              if (conflict) {
                matched++;
              } else {
                await prisma.timetableSlot.create({
                  data: {
                    courseId: course.id,
                    roomId: roomRecord.id,
                    facultyId: existingFacultySlot?.facultyId ?? null,
                    dayOfWeek: day as any,
                    period: period as any,
                    semester,
                    branch,
                  },
                });
                created++;
              }
            } catch (e: any) {
              errors.push({ reason: "Slot upsert failed: " + e.message, context });
            }
          }
        }
      }

      // ── 9. Finalize job record ────────────────────────────────────────────────
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          createdRows: created,
          matchedRows: matched,
          failedRows: errors.length,
          errorLog: errors as any,
          completedAt: new Date(),
        },
      });

      // Trigger live dashboard analytics recalculation
      await analyticsQueue.add("recompute", {
        trigger: "ingestion-complete",
        entityType: "timetable",
      });

      console.log(
        "[pdf-worker] Done. created=" + created +
        " matched=" + matched +
        " errors=" + errors.length
      );

    } catch (err: any) {
      console.error("[pdf-worker] Job " + jobId + " failed:", err.message);
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          errorLog: [{ reason: err.message }, ...errors] as any,
          completedAt: new Date(),
        },
      });
      throw err;
    }
  },
  {
    connection: getRedis(),
    concurrency: 1, // PDF parsing is CPU-heavy; keep concurrency low
  }
);

worker.on("failed", (job, err) =>
  console.error("[pdf-worker] Job " + (job?.id ?? "?") + " failed:", err.message)
);

console.log("[pdf-worker] Listening on pdf-parse queue");
