import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import nodemailer from "nodemailer";

/**
 * Fail-closed email delivery (Phase 2 plan §13, docs/adr/0003-phase-2-authentication.md).
 *
 * Two independent guards keep a misconfiguration from silently degrading:
 *   1. `EMAIL_TRANSPORT` selects the transport explicitly — never inferred
 *      from NODE_ENV alone.
 *   2. The file-sink transport additionally refuses to run at all when
 *      NODE_ENV === "production", even if EMAIL_TRANSPORT is misconfigured
 *      to "file" there — so a bad env var can never make a production
 *      deploy write real reset/invitation tokens to a local file instead of
 *      actually emailing them.
 *
 * Production SMTP configuration is validated once, at module load, and
 * throws immediately if incomplete — the process refuses to start rather
 * than send email through an unconfigured or fallback path.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function readSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  return { host, port, user, password, from };
}

/**
 * Called at startup (src/server/auth.ts) — throws, refusing to boot, if
 * production is missing any required SMTP variable. Never called in a
 * context where a missing variable should be tolerated.
 */
export function assertEmailConfigured(): void {
  const transport = process.env.EMAIL_TRANSPORT;
  if (isProduction()) {
    if (transport !== "smtp") {
      throw new Error(
        'EMAIL_TRANSPORT must be "smtp" in production. Refusing to start rather than fall back to a development transport.',
      );
    }
    const { host, port, user, password, from } = readSmtpConfig();
    if (!host || !port || !user || !password || !from) {
      throw new Error(
        "Production SMTP configuration is incomplete (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM). Refusing to start.",
      );
    }
    return;
  }
  if (transport !== "smtp" && transport !== "file") {
    throw new Error('EMAIL_TRANSPORT must be "smtp" or "file" (development/test only).');
  }
}

let smtpTransporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function getSmtpTransporter() {
  if (!smtpTransporter) {
    const { host, port, user, password } = readSmtpConfig();
    if (!host || !port || !user || !password) {
      throw new Error("SMTP configuration is incomplete — cannot send email.");
    }
    smtpTransporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass: password },
    });
  }
  return smtpTransporter;
}

const FILE_SINK_PATH = ".local/mail.log";

/**
 * Development/test-only transport. Writes to a git-ignored local file,
 * never to the application's normal logging output, so a captured
 * terminal/CI log can never contain a real token. Refuses to run in
 * production regardless of EMAIL_TRANSPORT's value — a second,
 * independent guard beyond assertEmailConfigured's own check.
 */
async function sendViaFileSink(input: SendEmailInput): Promise<void> {
  if (isProduction()) {
    throw new Error(
      "The file-sink email transport refuses to run when NODE_ENV=production, regardless of EMAIL_TRANSPORT.",
    );
  }
  await mkdir(dirname(FILE_SINK_PATH), { recursive: true });
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...input })}\n`;
  await appendFile(FILE_SINK_PATH, line, "utf8");
}

async function sendViaSmtp(input: SendEmailInput): Promise<void> {
  const { from } = readSmtpConfig();
  await getSmtpTransporter().sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}

/**
 * The only send function project code should call. Never logs `input` —
 * callers must not pass secrets/tokens to any logger either; this function
 * itself only ever writes the message body to the selected transport
 * (SMTP wire, or the git-ignored dev file sink), never to console/stdout.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  assertEmailConfigured();
  const transport = process.env.EMAIL_TRANSPORT;
  if (transport === "smtp") {
    await sendViaSmtp(input);
    return;
  }
  await sendViaFileSink(input);
}
