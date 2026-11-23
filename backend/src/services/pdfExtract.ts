/**
 * Extraction of a grid-style timetable PDF into editable rows. Nothing here touches the
 * database: the output is staged for human review (see routes/ingestion.ts).
 *
 * Layout assumption: one header row of period labels (roman numerals, optional "Break"),
 * then one row per working day whose first cell is the day name; each class cell sits under
 * its period column and reads like "CS200 (C101)" or "CS290 Lab (L1)".
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  page?: number;
}

export interface ExtractedRow {
  id: string;
  day: string; // MONDAY ... SUNDAY
  periodLabel: string;
  raw: string;
  subjectCode: string; // abbreviation as printed; matched against subjects during staging
  roomNumber: string | null;
  batchName: string | null;
  facultyProfileId: number | null;
  length: number;
}

export interface ExtractedTimetable {
  meta: { department?: string; branch?: string; semester?: string; section?: string; title?: string };
  columns: { label: string; x: number }[];
  rows: ExtractedRow[];
  warnings: string[];
}

const DAY_NAMES: Record<string, string> = {
  MONDAY: "MONDAY", MON: "MONDAY", TUESDAY: "TUESDAY", TUE: "TUESDAY", TUES: "TUESDAY", WEDNESDAY: "WEDNESDAY", WED: "WEDNESDAY",
  THURSDAY: "THURSDAY", THU: "THURSDAY", THUR: "THURSDAY", THURS: "THURSDAY", FRIDAY: "FRIDAY", FRI: "FRIDAY",
  SATURDAY: "SATURDAY", SAT: "SATURDAY", SUNDAY: "SUNDAY", SUN: "SUNDAY",
};
const ROMAN = /^(I{1,3}|IV|VI{0,3}|IX|X)$/;

export async function extractTextItems(filePath: string): Promise<TextItem[]> {
  // pdfjs-dist v4 is ESM-only; tsc (module: commonjs) would turn a literal import() into require().
  // A Function-wrapped import() is left untouched and is a real dynamic import under Node. Test
  // runners that execute inside a VM context reject that form, so fall back to a plain import().
  const spec = "pdfjs-dist/legacy/build/pdf.mjs";
  let pdfjs: any;
  try {
    pdfjs = await (new Function("s", "return import(s)") as (s: string) => Promise<any>)(spec);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    pdfjs = await import(spec as string);
  }
  const doc = await pdfjs.getDocument({ url: filePath, verbosity: 0, useSystemFonts: true }).promise;
  const items: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items as { str?: string; transform: number[] }[]) {
      if (it.str && it.str.trim()) items.push({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], page: p });
    }
  }
  return items;
}

function groupRows(items: TextItem[], tol = 3): TextItem[][] {
  const sorted = [...items].sort((a, b) => (a.page ?? 1) - (b.page ?? 1) || b.y - a.y || a.x - b.x);
  const rows: { page: number; y: number; items: TextItem[] }[] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && last.page === (it.page ?? 1) && Math.abs(last.y - it.y) <= tol) last.items.push(it);
    else rows.push({ page: it.page ?? 1, y: it.y, items: [it] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x));
}

/** "CNS(219/220)BCT(G2/G3)" -> [{abbr:"CNS",room:"219/220"},{abbr:"BCT",room:"G2/G3"}] */
export function parseCell(cell: string): { abbr: string; room: string | null; batch: string | null }[] {
  const text = cell.trim();
  if (!text || /^[-–—\s]+$/.test(text) || /^(lunch|break)$/i.test(text)) return [];
  const out: { abbr: string; room: string | null; batch: string | null }[] = [];
  const segs = text.split(/(?<=\))\s*(?=[A-Za-z])/g);
  for (const seg of segs) {
    const m = seg.trim().match(/^([A-Za-z][A-Za-z0-9\s\-.]*?)\s*(?:\(([^)]+)\))?$/);
    const abbr = (m ? m[1] : seg.replace(/\([^)]*\)/g, "")).trim();
    if (abbr.length < 2) continue;
    // "CS290 Lab B1" -> batch token at the end
    const b = abbr.match(/^(.*?)\s+(B\d+)$/i);
    out.push({ abbr: (b ? b[1] : abbr).trim(), room: m?.[2]?.trim() ?? null, batch: b ? b[2].toUpperCase() : null });
  }
  return out;
}

export function parseTimetableItems(items: TextItem[]): ExtractedTimetable {
  const warnings: string[] = [];
  if (!items.length) throw new Error("No text content could be extracted from the PDF (is it a scanned image?)");
  const rows = groupRows(items);
  const meta: ExtractedTimetable["meta"] = {};
  let headerIdx = -1;
  let columns: { label: string; x: number }[] = [];

  rows.forEach((r, i) => {
    const line = r.map((x) => x.str).join(" ");
    if (headerIdx < 0) {
      const labels = r.filter((x) => ROMAN.test(x.str.toUpperCase()));
      if (labels.length >= 3 && labels.length >= r.length - 3) {
        headerIdx = i;
        columns = r.filter((x) => ROMAN.test(x.str.toUpperCase()) || /^(break|lunch)$/i.test(x.str)).map((x) => ({ label: x.str.toUpperCase(), x: x.x }));
        return;
      }
    }
    meta.department ??= line.match(/Department[:\s]+([A-Za-z&]+)/i)?.[1]?.toUpperCase();
    meta.branch ??= line.match(/Branch[:\s]+([A-Za-z&]+)/i)?.[1]?.toUpperCase();
    meta.semester ??= line.match(/Semester[:\s]*([IVX\d]+)/i)?.[1]?.toUpperCase();
    meta.section ??= line.match(/Section[:\s]+([A-Za-z0-9]+)/i)?.[1]?.toUpperCase();
    if (headerIdx < 0 && !meta.title && line.length > 8) meta.title = line.slice(0, 200);
  });
  if (headerIdx < 0 || columns.length < 3) throw new Error("Could not find the period header row (expected columns such as I, II, III ...)");

  const gaps = columns.slice(1).map((c, i) => c.x - columns[i].x).filter((g) => g > 0);
  const tol = gaps.length ? Math.min(...gaps) / 2 : 30;
  const nearest = (x: number) => {
    let best = -1, d = Infinity;
    columns.forEach((c, i) => { const dd = Math.abs(c.x - x); if (dd < d) { d = dd; best = i; } });
    return d <= tol * 1.6 ? best : -1;
  };

  const out: ExtractedRow[] = [];
  let seq = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const dayTok = r.find((x) => DAY_NAMES[x.str.toUpperCase().replace(/\.$/, "")]);
    if (!dayTok || r.indexOf(dayTok) > 1) continue;
    const day = DAY_NAMES[dayTok.str.toUpperCase().replace(/\.$/, "")];
    const cells = new Map<number, string[]>();
    for (const it of r) {
      if (it === dayTok) continue;
      const c = nearest(it.x);
      if (c < 0) { warnings.push(`${day}: text "${it.str}" does not sit under a period column and was ignored`); continue; }
      (cells.get(c) ?? cells.set(c, []).get(c)!).push(it.str);
    }
    for (const [c, parts] of [...cells.entries()].sort((a, b) => a[0] - b[0])) {
      const label = columns[c].label;
      if (/^(BREAK|LUNCH)$/.test(label)) continue;
      const raw = parts.join(" ");
      const tokens = parseCell(raw);
      if (!tokens.length && raw && !/^[-–—]+$/.test(raw)) warnings.push(`${day} ${label}: could not read "${raw}"`);
      for (const t of tokens) {
        out.push({ id: `r${++seq}`, day, periodLabel: label, raw, subjectCode: t.abbr, roomNumber: t.room, batchName: t.batch, facultyProfileId: null, length: 1 });
      }
    }
  }
  if (!out.length) warnings.push("No class cells were found under the period columns");
  return { meta, columns, rows: out, warnings };
}

export async function extractTimetable(filePath: string): Promise<ExtractedTimetable> {
  return parseTimetableItems(await extractTextItems(filePath));
}
