import { describe, expect, it } from "vitest";
import { assertProductionRequiresHttps } from "../../../src/lib/auth/production-guards";

describe("assertProductionRequiresHttps", () => {
  it("does nothing outside production, even with an HTTP URL", () => {
    expect(() => assertProductionRequiresHttps("http://localhost:3000", false)).not.toThrow();
  });

  it("throws in production when the URL is HTTP", () => {
    expect(() => assertProductionRequiresHttps("http://cdclabs.example", true)).toThrow(
      /must be HTTPS in production/,
    );
  });

  it("does not throw in production when the URL is HTTPS", () => {
    expect(() => assertProductionRequiresHttps("https://cdclabs.example", true)).not.toThrow();
  });
});
