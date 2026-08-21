import { describe, expect, it } from "vitest";
import { getInitials, getAvatarColors } from "../../../src/lib/avatar";

describe("getInitials", () => {
  it("takes the first letter of the first and last name", () => {
    expect(getInitials("Ayesha Khan")).toBe("AK");
  });

  it("uses a single letter for a one-word name", () => {
    expect(getInitials("Administrator")).toBe("A");
  });

  it("collapses extra whitespace", () => {
    expect(getInitials("  Zeeshan   Ali  ")).toBe("ZA");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(getInitials("")).toBe("?");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("ayesha khan")).toBe("AK");
  });
});

describe("getAvatarColors", () => {
  it("is deterministic for the same seed", () => {
    expect(getAvatarColors("user-1")).toEqual(getAvatarColors("user-1"));
  });

  it("returns a bg/fg pair from the fixed palette", () => {
    const { bg, fg } = getAvatarColors("user-2");
    expect(bg).toMatch(/^var\(--color-/);
    expect(fg).toMatch(/^var\(--color-/);
  });
});
