/**
 * Calendar-date handling for the `@db.Date` columns Phase 3B writes to
 * (`daily_expenses.expense_date`, `party_income.income_date`,
 * `counter_income.income_date`). A `@db.Date` column has no time-zone
 * component once stored — Postgres keeps exactly the calendar date it was
 * given. Asia/Karachi (DR-02, CLAUDE.md §19) matters only for computing
 * *which* calendar date "today" or "this month" currently is — never for
 * interpreting a date already typed by a user, and never via a hardcoded
 * `+5` offset (Pakistan has no DST, but the IANA zone is still used so the
 * code stays correct and self-documenting rather than relying on an
 * assumption that never changes only by coincidence).
 *
 * `z.coerce.date()`/`new Date("2026-08-21")` are deliberately never used:
 * both parse via the environment's local time zone or as UTC-midnight
 * depending on engine/format, which is exactly the ambiguity this module
 * exists to remove. Every calendar date in this codebase is a plain
 * `YYYY-MM-DD` string until the one explicit `parseCalendarDate` call that
 * turns it into a UTC-midnight `Date` for Prisma.
 */

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const KARACHI_TIME_ZONE = "Asia/Karachi";

function pad(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

/**
 * Strict `YYYY-MM-DD` parsing with round-trip validation via `Date.UTC` —
 * rejects malformed input (wrong shape, non-numeric) and calendar
 * impossibilities alike (`2026-02-30`, `2026-13-01`), because `Date.UTC`
 * silently rolls invalid components into the next month/year rather than
 * throwing; comparing the round-tripped components back against the input
 * is what catches that. Returns `null` on any rejection — never throws —
 * so callers (Zod `.refine`, form validation) can produce a field-level
 * error rather than a crash.
 */
export function parseCalendarDate(input: string): Date | null {
  const match = CALENDAR_DATE_PATTERN.exec(input);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return candidate;
}

/** The inverse of `parseCalendarDate` — a UTC-midnight `Date` (as read back from a `@db.Date` column) to its `YYYY-MM-DD` string. */
export function formatCalendarDate(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

/**
 * Historical-import `capturedAt` convention (FR-IMP): noon Asia/Karachi on
 * the given calendar date, converted to UTC. Unlike `todayInKarachi`
 * (which reads the *current* instant and must never hardcode an offset,
 * since "now" is only ever knowable via a real timezone conversion), this
 * converts one already-fully-known calendar date's "noon local" to UTC —
 * fixed arithmetic is safe here specifically because Asia/Karachi has no
 * DST (DR-02): noon Karachi is always exactly 07:00 UTC, on every date,
 * with nothing that could silently drift the way a live "now" could.
 */
export function noonKarachiUtcForDate(dateString: string): Date {
  const date = parseCalendarDate(dateString);
  if (!date) {
    throw new Error(`noonKarachiUtcForDate: invalid calendar date "${dateString}".`);
  }
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}

/**
 * Reads the current Asia/Karachi calendar date via `formatToParts` rather
 * than trusting `.format()`'s output shape — a locale's formatted string
 * layout (separators, field order, calendar system) is not guaranteed
 * stable across every ICU build, but each part's `type`/`value` pair is
 * part of the stable `Intl.DateTimeFormat` contract, so the year/month/day
 * values are read individually and assembled by this module instead.
 */
function karachiPartsNow(referenceDate: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KARACHI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  const read = (type: "year" | "month" | "day"): number => {
    const part = parts.find((entry) => entry.type === type);
    if (!part) {
      throw new Error(`Intl.DateTimeFormat.formatToParts did not produce a "${type}" part.`);
    }
    return Number(part.value);
  };

  return { year: read("year"), month: read("month"), day: read("day") };
}

/** Today's calendar date in Asia/Karachi, as `YYYY-MM-DD`. Defaults to the real current instant; a `referenceDate` may be passed for deterministic tests. */
export function todayInKarachi(referenceDate: Date = new Date()): string {
  const { year, month, day } = karachiPartsNow(referenceDate);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** A full `YYYY-MM-DD HH:mm` Asia/Karachi timestamp — FR-RPT-08's "date produced" stamp on an export. Same `formatToParts` discipline as `karachiPartsNow`, never `.format()`'s locale-dependent string shape. */
export function formatKarachiTimestamp(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(referenceDate);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
}

/** The current Asia/Karachi calendar month, as `YYYY-MM` (FR-RES-01/02, BR-13's query-time month default). */
export function currentYearMonthInKarachi(referenceDate: Date = new Date()): string {
  const { year, month } = karachiPartsNow(referenceDate);
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

/** Strict `YYYY-MM` parsing (no day component) — returns `null` on any malformed or out-of-range (month 00/13+) input, never throws. */
export function parseYearMonth(input: string): { year: number; month: number } | null {
  const match = YEAR_MONTH_PATTERN.exec(input);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

/** First and last calendar day of the given `YYYY-MM` month, as `YYYY-MM-DD` strings — the default date-range boundary for a month-scoped query (BR-13). */
export function monthBounds(yearMonth: string): { firstDay: string; lastDay: string } {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    throw new Error(`"${yearMonth}" is not a valid YYYY-MM month.`);
  }
  const { year, month } = parsed;
  // Day 0 of the *next* month is the last day of *this* month — a standard
  // Date.UTC idiom, safe here because month is only ever used for this one
  // rollover computation, never compared back against input like
  // parseCalendarDate does.
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    firstDay: `${pad(year, 4)}-${pad(month, 2)}-01`,
    lastDay: `${pad(year, 4)}-${pad(month, 2)}-${pad(lastDayOfMonth, 2)}`,
  };
}

/** The `YYYY-MM` month immediately before the given one (FR-MEXP-06's recurring pre-fill source month) — never computed via `Date` arithmetic on a day-of-month value, since that risks month-length drift; this only ever moves whole months. */
export function previousYearMonth(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    throw new Error(`"${yearMonth}" is not a valid YYYY-MM month.`);
  }
  const { year, month } = parsed;
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${pad(previous.getUTCFullYear(), 4)}-${pad(previous.getUTCMonth() + 1, 2)}`;
}

/** The `YYYY-MM` month immediately after the given one — FR-RES-03's "move to the next month in one action." Mirrors `previousYearMonth` exactly (whole-month arithmetic only, never a day-of-month `Date` offset). */
export function nextYearMonth(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    throw new Error(`"${yearMonth}" is not a valid YYYY-MM month.`);
  }
  const { year, month } = parsed;
  const next = new Date(Date.UTC(year, month, 1));
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1, 2)}`;
}

/**
 * FR-RES-01/BR-13: an arbitrary user-chosen `[from, to]` date range, for
 * Monthly Summary and Party Income totals — never restricted to a whole
 * calendar month (unlike `monthBounds`). Both bounds are validated via the
 * same strict `parseCalendarDate` every other date field in this codebase
 * uses; `from` must not be after `to`. There is no lower/upper bound check
 * beyond that — BR-12 (no month locking) means any historical or future
 * range may legitimately be queried.
 */
export function parseCustomDateRange(
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (!parseCalendarDate(from) || !parseCalendarDate(to)) {
    return null;
  }
  if (from > to) {
    return null;
  }
  return { from, to };
}

/** Every `YYYY-MM-DD` calendar date in the given `YYYY-MM` month, in order — the Party Income grid's day-column source (FR-PINC-07). */
export function daysInMonth(yearMonth: string): string[] {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    throw new Error(`"${yearMonth}" is not a valid YYYY-MM month.`);
  }
  const { year, month } = parsed;
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from(
    { length: lastDayOfMonth },
    (_, index) => `${pad(year, 4)}-${pad(month, 2)}-${pad(index + 1, 2)}`,
  );
}
