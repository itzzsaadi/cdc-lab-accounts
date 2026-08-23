import { redactSensitiveValues } from "../audit-redaction";

/**
 * NFR-REL-06 — host-native structured logging.
 *
 * One JSON object per line on stdout/stderr, which every managed host
 * (and `docker logs`) already collects, parses, and makes searchable. This
 * is deliberately *not* a hosted error-monitoring SDK: CON-02 keeps
 * hosting cost minimal and CON-07 puts single-developer maintainability
 * above capability, and a vendor SDK would also mean this system's
 * financial data leaving the deployment. See
 * `docs/adr/0010-phase-8a-release-hardening.md`.
 *
 * Every payload passes through `redactSensitiveValues` — the same
 * substring-matching redaction the Audit Log screens already use
 * (password/token/secret/cookie/authorization/session/credential/hash).
 * That means a caller cannot accidentally log a session token or a reset
 * URL parameter even by passing an object it did not inspect first. Raw
 * uploaded file bytes are never loggable at all: `context` is typed to
 * reject them, and any `Buffer`/`Uint8Array` reaching `safeContext` is
 * replaced with a size marker rather than serialized.
 */

export type LogLevel = "info" | "warn" | "error";

/** Deliberately narrow — no `Buffer`, no `unknown`, so a file body cannot be passed without an explicit, visible cast. */
export type LogContext = Record<string, string | number | boolean | null | undefined>;

interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function isBinary(value: unknown): boolean {
  return value instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(value));
}

/** Redacts sensitive keys and replaces any binary value with a non-reversible size marker. */
function safeContext(context: LogContext | undefined): Record<string, unknown> {
  if (!context) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    cleaned[key] = isBinary(value)
      ? `[binary ${(value as unknown as Uint8Array).byteLength} bytes]`
      : value;
  }
  return redactSensitiveValues(cleaned) as Record<string, unknown>;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const record: LogRecord = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...safeContext(context),
  };
  // One line, always parseable. `console.error` for error level so hosts
  // that split streams route it to stderr; everything else to stdout.
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logInfo(message: string, context?: LogContext): void {
  emit("info", message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  emit("warn", message, context);
}

/**
 * The one place an actual `Error` is turned into a log record. Only
 * `name` and `message` are captured, plus the stack **when not in
 * production** — a production stack in the log stream is fine in
 * principle (it never reaches the browser, NFR-SEC-10 is about
 * *responses*), but keeping it out by default means an accidentally
 * public log endpoint leaks less. Set `LOG_STACKS=true` to include it in
 * production when actively diagnosing.
 */
export function logError(message: string, error: unknown, context?: LogContext): void {
  const includeStack = process.env.NODE_ENV !== "production" || process.env.LOG_STACKS === "true";
  const details =
    error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
          ...(includeStack && error.stack ? { stack: error.stack } : {}),
        }
      : { errorName: "NonError", errorMessage: String(error) };
  emit("error", message, { ...context, ...details });
}
