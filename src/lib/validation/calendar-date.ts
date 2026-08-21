import { z } from "zod";
import { parseCalendarDate, parseYearMonth } from "../domain/calendar-date";

/**
 * The one Zod schema every Phase 3B date field uses — deliberately never
 * `z.coerce.date()`, which accepts ambiguous/engine-dependent formats.
 * This requires the exact `YYYY-MM-DD` shape and rejects any calendar
 * impossibility via `parseCalendarDate`'s round-trip check, keeping the
 * string form (not a `Date`) as the validated value — the server action
 * converts it to a UTC-midnight `Date` for Prisma at the point of use.
 */
export const calendarDateSchema = z.string().refine((value) => parseCalendarDate(value) !== null, {
  message: "Enter a valid date (YYYY-MM-DD).",
});

/** The `YYYY-MM` month-selector schema (Party Income grid's month picker). */
export const yearMonthSchema = z.string().refine((value) => parseYearMonth(value) !== null, {
  message: "Enter a valid month (YYYY-MM).",
});
