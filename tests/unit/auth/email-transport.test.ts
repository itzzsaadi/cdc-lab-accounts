import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertEmailConfigured } from "../../../src/lib/email/transport";

const ENV_KEYS = [
  "NODE_ENV",
  "EMAIL_TRANSPORT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
] as const;

// NODE_ENV is typed read-only on `process.env` — this alias lets tests set
// it freely without fighting that type.
const mutableEnv = process.env as Record<string, string | undefined>;

describe("assertEmailConfigured — fail-closed email delivery", () => {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete mutableEnv[key];
      else mutableEnv[key] = snapshot[key];
    }
  });

  it("throws in production when EMAIL_TRANSPORT is not smtp", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.EMAIL_TRANSPORT = "file";
    expect(() => assertEmailConfigured()).toThrow(/must be "smtp" in production/);
  });

  it("throws in production when SMTP config is incomplete", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.EMAIL_TRANSPORT = "smtp";
    delete mutableEnv.SMTP_HOST;
    expect(() => assertEmailConfigured()).toThrow(/SMTP configuration is incomplete/);
  });

  it("does not throw in production with complete SMTP config", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.EMAIL_TRANSPORT = "smtp";
    mutableEnv.SMTP_HOST = "smtp.example.com";
    mutableEnv.SMTP_PORT = "587";
    mutableEnv.SMTP_USER = "user";
    mutableEnv.SMTP_PASSWORD = "pass";
    mutableEnv.SMTP_FROM = "noreply@example.com";
    expect(() => assertEmailConfigured()).not.toThrow();
  });

  it("allows the file transport outside production", () => {
    mutableEnv.NODE_ENV = "test";
    mutableEnv.EMAIL_TRANSPORT = "file";
    expect(() => assertEmailConfigured()).not.toThrow();
  });

  it("rejects an invalid EMAIL_TRANSPORT value outside production", () => {
    mutableEnv.NODE_ENV = "test";
    mutableEnv.EMAIL_TRANSPORT = "console";
    expect(() => assertEmailConfigured()).toThrow(/must be "smtp" or "file"/);
  });
});
