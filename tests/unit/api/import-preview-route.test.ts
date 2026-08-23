import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { handleImportPreviewRequest } from "../../../src/app/api/admin/import/preview/route";
import type { AuthenticatedUser } from "../../../src/lib/permissions/guard";
import { resetRateLimitsForTesting } from "../../../src/lib/rate-limit";
import { MAX_IMPORT_FILE_BYTES } from "../../../src/lib/validation/import";

afterEach(() => {
  resetRateLimitsForTesting();
});

function requestWithHeaders(headers: HeadersInit = {}) {
  const formData = vi.fn();
  return {
    request: { headers: new Headers(headers), formData } as unknown as NextRequest,
    formData,
  };
}

const ADMIN: AuthenticatedUser = {
  id: "admin-1",
  role: "ADMIN",
  isPartner: false,
  isActive: true,
};

describe("historical import preview route hardening (FR-IMP-01/02, NFR-SEC-03)", () => {
  it("rejects an unauthenticated caller before parsing multipart data", async () => {
    const { request, formData } = requestWithHeaders();

    const response = await handleImportPreviewRequest(request, null);

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects a non-Admin caller before parsing multipart data", async () => {
    const { request, formData } = requestWithHeaders();

    const response = await handleImportPreviewRequest(request, {
      ...ADMIN,
      id: "operator-1",
      role: "OPERATOR",
    });

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared request before parsing multipart data", async () => {
    const { request, formData } = requestWithHeaders({
      "content-length": String(MAX_IMPORT_FILE_BYTES + 64 * 1024 + 1),
    });

    const response = await handleImportPreviewRequest(request, ADMIN);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects a malformed Content-Length before parsing multipart data", async () => {
    const { request, formData } = requestWithHeaders({ "content-length": "not-a-number" });

    const response = await handleImportPreviewRequest(request, ADMIN);

    expect(response.status).toBe(400);
    expect(formData).not.toHaveBeenCalled();
  });
});
