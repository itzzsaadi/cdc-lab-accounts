import { describe, expect, it } from "vitest";
import {
  canonicalizeForFingerprint,
  computeRequestFingerprint,
} from "../../../src/lib/offline/fingerprint";

describe("canonicalizeForFingerprint", () => {
  it("sorts object keys regardless of insertion order", () => {
    expect(canonicalizeForFingerprint({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalizeForFingerprint({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("sorts nested object keys too", () => {
    const a = canonicalizeForFingerprint({ x: { z: 1, y: 2 }, w: 3 });
    const b = canonicalizeForFingerprint({ w: 3, x: { y: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("preserves array order (arrays are not sorted)", () => {
    expect(canonicalizeForFingerprint([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined object properties, matching JSON.stringify", () => {
    expect(canonicalizeForFingerprint({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("coerces undefined array elements to null, matching JSON.stringify", () => {
    expect(canonicalizeForFingerprint([1, undefined, 3])).toBe("[1,null,3]");
  });

  it("throws for a top-level undefined value", () => {
    expect(() => canonicalizeForFingerprint(undefined)).toThrow();
  });
});

describe("computeRequestFingerprint", () => {
  it("is deterministic regardless of payload key order", async () => {
    const a = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid: "11111111-1111-1111-1111-111111111111",
      payload: { amount: "100", note: "x" },
    });
    const b = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid: "11111111-1111-1111-1111-111111111111",
      payload: { note: "x", amount: "100" },
    });
    expect(a).toBe(b);
  });

  it("produces a 64-character lowercase hex digest", async () => {
    const digest = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid: "11111111-1111-1111-1111-111111111111",
      payload: { amount: "100" },
    });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when the payload differs", async () => {
    const a = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid: "11111111-1111-1111-1111-111111111111",
      payload: { amount: "100" },
    });
    const b = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid: "11111111-1111-1111-1111-111111111111",
      payload: { amount: "200" },
    });
    expect(a).not.toBe(b);
  });

  it("differs when the action differs but the payload does not", async () => {
    const a = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "CREATE",
      clientUuid: "11111111-1111-1111-1111-111111111111",
      payload: { amount: "100" },
    });
    const b = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "UPDATE",
      clientUuid: "11111111-1111-1111-1111-111111111111",
      payload: { amount: "100" },
    });
    expect(a).not.toBe(b);
  });
});
