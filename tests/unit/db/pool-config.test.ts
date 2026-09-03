import { describe, expect, it } from "vitest";
import { parsePoolMax } from "../../../src/lib/db/pool-config";

describe("parsePoolMax", () => {
  it("returns undefined when unset (pg.Pool's own default applies)", () => {
    expect(parsePoolMax(undefined)).toBeUndefined();
    expect(parsePoolMax("")).toBeUndefined();
  });

  it("parses a positive integer string", () => {
    expect(parsePoolMax("3")).toBe(3);
    expect(parsePoolMax("1")).toBe(1);
  });

  it("rejects zero, negative, and non-integer values", () => {
    expect(() => parsePoolMax("0")).toThrow(/positive integer/);
    expect(() => parsePoolMax("-1")).toThrow(/positive integer/);
    expect(() => parsePoolMax("2.5")).toThrow(/positive integer/);
    expect(() => parsePoolMax("not-a-number")).toThrow(/positive integer/);
  });
});
