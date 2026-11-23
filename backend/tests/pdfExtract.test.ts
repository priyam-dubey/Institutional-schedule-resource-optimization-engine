import path from "path";
import { describe, expect, it } from "vitest";
import { extractTimetable, parseCell, parseTimetableItems } from "../src/services/pdfExtract";

describe("pdf extraction (real PDF via pdfjs-dist v4)", () => {
  it("extracts metadata, columns and class cells from a grid timetable PDF", async () => {
    const ex = await extractTimetable(path.join(__dirname, "fixtures/timetable.pdf"));
    expect(ex.meta).toMatchObject({ department: "CSE", branch: "BTECH", semester: "3", section: "A" });
    expect(ex.columns.map((c) => c.label)).toEqual(["I", "II", "III", "BREAK", "IV", "V", "VI"]);
    const key = ex.rows.map((r) => `${r.day}|${r.periodLabel}|${r.subjectCode}|${r.roomNumber}|${r.batchName ?? ""}`);
    expect(key).toContain("MONDAY|I|CS200|C100|");
    expect(key).toContain("MONDAY|III|CS 202|C101|");
    expect(key).toContain("TUESDAY|V|CS290|L1|B1");
    expect(key).toContain("TUESDAY|II|XYZ9|C100|");
    expect(ex.rows.length).toBe(4 + 3 + 2 + 1);
    expect(new Set(ex.rows.map((r) => r.id)).size).toBe(ex.rows.length);
  });

  it("splits merged cells and ignores dashes/breaks", () => {
    expect(parseCell("CNS(219/220)BCT(G2/G3)")).toEqual([
      { abbr: "CNS", room: "219/220", batch: null },
      { abbr: "BCT", room: "G2/G3", batch: null },
    ]);
    expect(parseCell("-")).toEqual([]);
    expect(parseCell("LUNCH")).toEqual([]);
  });

  it("fails clearly on documents without a period header", () => {
    expect(() => parseTimetableItems([{ str: "hello", x: 1, y: 1 }])).toThrow(/period header/);
    expect(() => parseTimetableItems([])).toThrow(/No text/);
  });
});
