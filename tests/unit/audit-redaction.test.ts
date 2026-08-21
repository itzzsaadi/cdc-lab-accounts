import { describe, expect, it } from "vitest";
import { redactSensitiveValues } from "../../src/lib/audit-redaction";

describe("redactSensitiveValues (defensive Audit Log display redaction)", () => {
  it("redacts a flat sensitive key", () => {
    expect(redactSensitiveValues({ password: "hunter2", amount: "500" })).toEqual({
      password: "[REDACTED]",
      amount: "500",
    });
  });

  it("is case-insensitive", () => {
    expect(redactSensitiveValues({ Password: "x", TOKEN: "y", SeCrEt: "z" })).toEqual({
      Password: "[REDACTED]",
      TOKEN: "[REDACTED]",
      SeCrEt: "[REDACTED]",
    });
  });

  it("matches by substring", () => {
    expect(
      redactSensitiveValues({
        password_hash: "x",
        resetToken: "y",
        sessionId: "z",
        cookieValue: "w",
      }),
    ).toEqual({
      password_hash: "[REDACTED]",
      resetToken: "[REDACTED]",
      sessionId: "[REDACTED]",
      cookieValue: "[REDACTED]",
    });
  });

  it("recurses into nested objects", () => {
    expect(redactSensitiveValues({ auth: { credential: "abc", note: "keep" } })).toEqual({
      auth: { credential: "[REDACTED]", note: "keep" },
    });
  });

  it("recurses into arrays of objects", () => {
    expect(redactSensitiveValues([{ token: "abc" }, { amount: "10" }])).toEqual([
      { token: "[REDACTED]" },
      { amount: "10" },
    ]);
  });

  it("covers every mandated keyword", () => {
    const input = {
      password: 1,
      token: 2,
      secret: 3,
      cookie: 4,
      authorization: 5,
      session: 6,
      credential: 7,
      hash: 8,
    };
    const result = redactSensitiveValues(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(result[key]).toBe("[REDACTED]");
    }
  });

  it("leaves ordinary business fields untouched", () => {
    expect(
      redactSensitiveValues({ categoryId: "abc", amount: "500", fundingSource: "BUSINESS" }),
    ).toEqual({
      categoryId: "abc",
      amount: "500",
      fundingSource: "BUSINESS",
    });
  });

  it("passes through primitives and null unchanged", () => {
    expect(redactSensitiveValues("plain string")).toBe("plain string");
    expect(redactSensitiveValues(42)).toBe(42);
    expect(redactSensitiveValues(null)).toBeNull();
  });
});
