import { describe, expect, it } from "vitest";
import {
  parseCalendarDate,
  formatCalendarDate,
  todayInKarachi,
  currentYearMonthInKarachi,
  parseYearMonth,
  monthBounds,
  daysInMonth,
  previousYearMonth,
  nextYearMonth,
  parseCustomDateRange,
  noonKarachiUtcForDate,
} from "../../../src/lib/domain/calendar-date";

describe("parseCalendarDate (strict YYYY-MM-DD, no z.coerce.date())", () => {
  it("parses a valid calendar date as UTC midnight", () => {
    const date = parseCalendarDate("2026-08-21");
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
    expect(date!.getUTCMonth()).toBe(7);
    expect(date!.getUTCDate()).toBe(21);
    expect(date!.getUTCHours()).toBe(0);
  });

  it("round-trips through formatCalendarDate", () => {
    const date = parseCalendarDate("2026-01-05");
    expect(formatCalendarDate(date!)).toBe("2026-01-05");
  });

  it.each([
    "2026-02-30", // February never has 30 days
    "2026-13-01", // month 13
    "2026-00-10", // month 0
    "2026-04-31", // April has 30 days
    "2026-8-21", // must be zero-padded
    "26-08-21", // must be 4-digit year
    "2026/08/21", // wrong separator
    "2026-08-21T00:00:00Z", // no time component allowed
    "not-a-date",
    "",
  ])("rejects calendar-impossible or malformed input: %s", (input) => {
    expect(parseCalendarDate(input)).toBeNull();
  });

  it("rejects a leap-day on a non-leap year but accepts it on a leap year", () => {
    expect(parseCalendarDate("2026-02-29")).toBeNull();
    expect(parseCalendarDate("2024-02-29")).not.toBeNull();
  });
});

describe("todayInKarachi (Intl.DateTimeFormat.formatToParts, not .format())", () => {
  it("returns a strict YYYY-MM-DD string", () => {
    const result = todayInKarachi(new Date("2026-08-21T12:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is timezone-independent of the host clock — UTC evening rolls to the next Karachi calendar day", () => {
    // 2026-08-21T20:00:00Z is 2026-08-22 01:00 in Asia/Karachi (UTC+5).
    expect(todayInKarachi(new Date("2026-08-21T20:00:00Z"))).toBe("2026-08-22");
    // 2026-08-21T18:00:00Z is still 2026-08-21 23:00 in Asia/Karachi.
    expect(todayInKarachi(new Date("2026-08-21T18:00:00Z"))).toBe("2026-08-21");
  });

  it("Pakistan has no DST — the +5:00 offset holds across a summer/winter boundary", () => {
    // 2026-01-15T19:01:00Z is 2026-01-16 00:01 in Asia/Karachi.
    expect(todayInKarachi(new Date("2026-01-15T19:01:00Z"))).toBe("2026-01-16");
    // 2026-07-15T19:01:00Z is also 2026-07-16 00:01 in Asia/Karachi — same
    // fixed offset, no daylight-saving shift.
    expect(todayInKarachi(new Date("2026-07-15T19:01:00Z"))).toBe("2026-07-16");
  });
});

describe("currentYearMonthInKarachi", () => {
  it("returns YYYY-MM for the current Karachi calendar month", () => {
    expect(currentYearMonthInKarachi(new Date("2026-08-21T20:00:00Z"))).toBe("2026-08");
  });

  it("rolls to the next month at the Karachi month boundary", () => {
    // 2026-08-31T20:00:00Z is 2026-09-01 01:00 in Asia/Karachi.
    expect(currentYearMonthInKarachi(new Date("2026-08-31T20:00:00Z"))).toBe("2026-09");
  });
});

describe("parseYearMonth", () => {
  it("parses a valid YYYY-MM", () => {
    expect(parseYearMonth("2026-08")).toEqual({ year: 2026, month: 8 });
  });

  it.each(["2026-00", "2026-13", "2026-8", "26-08", "2026-08-01"])("rejects: %s", (input) => {
    expect(parseYearMonth(input)).toBeNull();
  });
});

describe("monthBounds", () => {
  it("returns the first and last day of a 31-day month", () => {
    expect(monthBounds("2026-08")).toEqual({ firstDay: "2026-08-01", lastDay: "2026-08-31" });
  });

  it("returns the correct last day for February in a leap year", () => {
    expect(monthBounds("2024-02")).toEqual({ firstDay: "2024-02-01", lastDay: "2024-02-29" });
  });

  it("returns the correct last day for February in a non-leap year", () => {
    expect(monthBounds("2026-02")).toEqual({ firstDay: "2026-02-01", lastDay: "2026-02-28" });
  });

  it("throws for a malformed month", () => {
    expect(() => monthBounds("2026-13")).toThrow();
  });
});

describe("daysInMonth", () => {
  it("enumerates every calendar day in order", () => {
    const days = daysInMonth("2026-02");
    expect(days).toHaveLength(28);
    expect(days[0]).toBe("2026-02-01");
    expect(days[27]).toBe("2026-02-28");
  });

  it("enumerates 31 days for a 31-day month", () => {
    expect(daysInMonth("2026-01")).toHaveLength(31);
  });
});

describe("previousYearMonth (FR-MEXP-06's recurring pre-fill source month)", () => {
  it("moves back one month within the same year", () => {
    expect(previousYearMonth("2026-08")).toBe("2026-07");
  });

  it("rolls back across a year boundary", () => {
    expect(previousYearMonth("2026-01")).toBe("2025-12");
  });

  it("throws for a malformed month", () => {
    expect(() => previousYearMonth("2026-13")).toThrow();
  });
});

describe("nextYearMonth (FR-RES-03's one-action next-month step)", () => {
  it("moves forward one month within the same year", () => {
    expect(nextYearMonth("2026-07")).toBe("2026-08");
  });

  it("rolls forward across a year boundary", () => {
    expect(nextYearMonth("2025-12")).toBe("2026-01");
  });

  it("throws for a malformed month", () => {
    expect(() => nextYearMonth("2026-13")).toThrow();
  });
});

describe("noonKarachiUtcForDate (Phase 7 historical import — fixed +5 offset, an already-known calendar date)", () => {
  it("returns 07:00 UTC for a given calendar date (noon Asia/Karachi, fixed +5:00)", () => {
    const result = noonKarachiUtcForDate("2026-07-15");
    expect(result.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("holds the same fixed offset across a summer/winter boundary (no DST)", () => {
    expect(noonKarachiUtcForDate("2026-01-15").toISOString()).toBe("2026-01-15T07:00:00.000Z");
    expect(noonKarachiUtcForDate("2026-07-15").toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("throws for a malformed or calendar-impossible date", () => {
    expect(() => noonKarachiUtcForDate("2026-13-01")).toThrow();
    expect(() => noonKarachiUtcForDate("not-a-date")).toThrow();
  });
});

describe("parseCustomDateRange (FR-RES-01, BR-12 — any range, no month locking)", () => {
  it("accepts a valid range", () => {
    expect(parseCustomDateRange("2026-07-01", "2026-08-15")).toEqual({
      from: "2026-07-01",
      to: "2026-08-15",
    });
  });

  it("accepts a single-day range", () => {
    expect(parseCustomDateRange("2026-07-01", "2026-07-01")).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    });
  });

  it("rejects from after to", () => {
    expect(parseCustomDateRange("2026-08-01", "2026-07-01")).toBeNull();
  });

  it("rejects a malformed bound", () => {
    expect(parseCustomDateRange("2026-02-30", "2026-08-01")).toBeNull();
    expect(parseCustomDateRange("2026-07-01", "not-a-date")).toBeNull();
  });
});
