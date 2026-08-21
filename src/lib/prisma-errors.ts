import { Prisma } from "../../generated/prisma/client";

/**
 * Distinguishes *which* unique constraint a P2002 violation came from, by
 * the actual Postgres column list Prisma 7's driver-adapter error reports
 * (`error.meta.driverAdapterError.cause.constraint.fields`) — verified
 * directly against a live Postgres error in this project's own database,
 * not assumed from documentation. This project's Prisma version does not
 * populate the older `error.meta.target` shape at all for driver-adapter
 * errors, so `constraint.fields` is the real, structured signal to key on
 * here — never a string-match against `error.message` (constraint names
 * happen to be present in the message too, but the driver's own field list
 * is the more precise, less fragile source).
 *
 * This is the mechanism behind mandatory safeguard #1's concurrent-create
 * idempotency: a create's `client_uuid` unique-constraint violation is the
 * *only* P2002 ever treated as "someone else's concurrent request already
 * won" — a violation of an unrelated unique index (e.g.
 * `party_income_active_daily_cell_unique`) must never be caught here as
 * idempotent success; it is a genuine business-rule conflict.
 */
export function isUniqueConstraintViolationOn(error: unknown, columns: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const meta = error.meta as Record<string, unknown> | undefined;
  const driverAdapterError = meta?.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  const constraint = cause?.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields) || fields.length !== columns.length) {
    return false;
  }
  return columns.every((column, index) => fields[index] === column);
}
