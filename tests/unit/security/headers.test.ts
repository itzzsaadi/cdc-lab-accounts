import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../../src/proxy";
import { SECURITY_HEADERS, STATIC_PAGE_CSP } from "../../../src/lib/security/headers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Phase 8A security headers (NFR-SEC-01/06)", () => {
  it("keeps HSTS out of non-production environments", () => {
    expect(SECURITY_HEADERS.map((header) => header.key)).not.toContain("Strict-Transport-Security");
  });

  it("uses production-only HSTS without preload", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const productionHeaders = (await import("../../../src/lib/security/headers")).SECURITY_HEADERS;
    const hsts = productionHeaders.find((header) => header.key === "Strict-Transport-Security");

    expect(hsts?.value).toBe("max-age=63072000; includeSubDomains");
    expect(hsts?.value.toLowerCase()).not.toContain("preload");
  });

  it("generates a fresh enforced nonce policy with no production-style unsafe script directives", () => {
    const first = proxy(new NextRequest("http://localhost/sign-in"));
    const second = proxy(new NextRequest("http://localhost/sign-in"));
    const firstCsp = first.headers.get("content-security-policy")!;
    const secondCsp = second.headers.get("content-security-policy")!;

    expect(firstCsp).toContain("'strict-dynamic'");
    expect(firstCsp).not.toContain("'unsafe-inline'");
    expect(firstCsp).not.toContain("'unsafe-eval'");
    expect(firstCsp.match(/'nonce-([^']+)'/)?.[1]).not.toBe(
      secondCsp.match(/'nonce-([^']+)'/)?.[1],
    );
  });

  it("bounds the static offline-page exception", () => {
    expect(STATIC_PAGE_CSP).toContain("script-src 'self' 'unsafe-inline'");
    expect(STATIC_PAGE_CSP).not.toContain("'unsafe-eval'");
    expect(STATIC_PAGE_CSP).not.toContain("*");
  });
});
