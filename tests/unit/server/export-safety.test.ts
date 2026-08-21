import { describe, expect, it } from "vitest";
import { sanitizeTextCell, safeReportFilename } from "../../../src/server/reports/export-safety";

describe("sanitizeTextCell (formula-injection protection)", () => {
  it.each(["=cmd|'/c calc'!A1", "+1+1", "-1+1", "@SUM(A1)", "\ttabbed", "\rcarriage"])(
    "prefixes a dangerous leading character: %s",
    (input) => {
      expect(sanitizeTextCell(input)).toBe(`'${input}`);
    },
  );

  it("leaves an ordinary string untouched", () => {
    expect(sanitizeTextCell("WATER")).toBe("WATER");
    expect(sanitizeTextCell("Partner-funded tool")).toBe("Partner-funded tool");
  });
});

describe("safeReportFilename", () => {
  it("builds a filename from only internal values, no path separators", () => {
    const name = safeReportFilename(
      "2026-07-01_to_2026-07-31",
      new Date("2026-08-21T18:30:00Z"),
      "pdf",
    );
    expect(name).toMatch(/^monthly-summary-2026-07-01_to_2026-07-31-generated-\d{8}T\d{6}\.pdf$/);
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
  });
});
