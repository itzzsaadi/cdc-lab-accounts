import { describe, expect, it } from "vitest";
import { coalesceOperation } from "../../../src/lib/offline/coalesce";
import { computeRequestFingerprint } from "../../../src/lib/offline/fingerprint";
import type { QueuedOperation } from "../../../src/lib/offline/types";

async function makePending(
  overrides: Partial<QueuedOperation> & Pick<QueuedOperation, "action" | "payload">,
): Promise<QueuedOperation> {
  const clientUuid = overrides.clientUuid ?? "11111111-1111-1111-1111-111111111111";
  const requestFingerprint = await computeRequestFingerprint({
    entityType: overrides.entityType ?? "daily_expense",
    action: overrides.action,
    clientUuid,
    payload: overrides.payload,
  });
  return {
    operationId: "op-1",
    entityType: "daily_expense",
    clientUuid,
    status: "QUEUED",
    attempts: 2,
    nextAttemptAt: 12345,
    createdAt: 1000,
    requestFingerprint,
    ...overrides,
  };
}

describe("coalesceOperation", () => {
  it("rule 1: CREATE + UPDATE merges into one CREATE with latest values and original capturedAt", async () => {
    const pending = await makePending({
      action: "CREATE",
      payload: { clientUuid: "x", amount: "100", capturedAt: "2026-08-01T00:00:00.000Z" },
    });
    const result = await coalesceOperation(pending, {
      operationId: "op-2",
      entityType: "daily_expense",
      clientUuid: pending.clientUuid,
      action: "UPDATE",
      payload: { id: "row-1", expectedUpdatedAt: "irrelevant", amount: "200" },
    });
    expect(result).not.toBe("discard");
    expect(result).not.toBeNull();
    const merged = result as QueuedOperation;
    expect(merged.operationId).toBe("op-1");
    expect(merged.action).toBe("CREATE");
    expect(merged.payload.amount).toBe("200");
    expect(merged.payload.capturedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(merged.status).toBe("QUEUED");
    expect(merged.attempts).toBe(0);
  });

  it("rule 2: CREATE + ARCHIVE discards both", async () => {
    const pending = await makePending({ action: "CREATE", payload: { amount: "100" } });
    const result = await coalesceOperation(pending, {
      operationId: "op-2",
      entityType: "daily_expense",
      clientUuid: pending.clientUuid,
      action: "ARCHIVE",
      payload: { id: "row-1", expectedUpdatedAt: "v1" },
    });
    expect(result).toBe("discard");
  });

  it("rule 3: UPDATE + UPDATE merges keeping the original expectedUpdatedAt", async () => {
    const pending = await makePending({
      action: "UPDATE",
      payload: { id: "row-1", expectedUpdatedAt: "v1", amount: "100" },
    });
    const result = await coalesceOperation(pending, {
      operationId: "op-2",
      entityType: "daily_expense",
      clientUuid: pending.clientUuid,
      action: "UPDATE",
      payload: { id: "row-1", expectedUpdatedAt: "v2-should-be-discarded", amount: "300" },
    });
    const merged = result as QueuedOperation;
    expect(merged.action).toBe("UPDATE");
    expect(merged.payload.expectedUpdatedAt).toBe("v1");
    expect(merged.payload.amount).toBe("300");
  });

  it("rule 4: UPDATE + ARCHIVE collapses to ARCHIVE alone keeping the original expectedUpdatedAt", async () => {
    const pending = await makePending({
      action: "UPDATE",
      payload: { id: "row-1", expectedUpdatedAt: "v1", amount: "100" },
    });
    const result = await coalesceOperation(pending, {
      operationId: "op-2",
      entityType: "daily_expense",
      clientUuid: pending.clientUuid,
      action: "ARCHIVE",
      payload: { id: "row-1", expectedUpdatedAt: "v2-should-be-discarded" },
    });
    const merged = result as QueuedOperation;
    expect(merged.action).toBe("ARCHIVE");
    expect(merged.payload).toEqual({ id: "row-1", expectedUpdatedAt: "v1" });
  });

  it("rule 5 (enforced by caller, not this function): returns null for an undefined pair like CREATE+CREATE", async () => {
    const pending = await makePending({ action: "CREATE", payload: { amount: "100" } });
    const result = await coalesceOperation(pending, {
      operationId: "op-2",
      entityType: "daily_expense",
      clientUuid: pending.clientUuid,
      action: "CREATE",
      payload: { amount: "999" },
    });
    expect(result).toBeNull();
  });

  it("recomputes the request fingerprint over the merged payload, not the original", async () => {
    const pending = await makePending({
      action: "UPDATE",
      payload: { id: "row-1", expectedUpdatedAt: "v1", amount: "100" },
    });
    const originalFingerprint = pending.requestFingerprint;
    const result = await coalesceOperation(pending, {
      operationId: "op-2",
      entityType: "daily_expense",
      clientUuid: pending.clientUuid,
      action: "UPDATE",
      payload: { id: "row-1", expectedUpdatedAt: "v1", amount: "300" },
    });
    const merged = result as QueuedOperation;
    expect(merged.requestFingerprint).not.toBe(originalFingerprint);
    const expected = await computeRequestFingerprint({
      entityType: "daily_expense",
      action: "UPDATE",
      clientUuid: pending.clientUuid,
      payload: merged.payload,
    });
    expect(merged.requestFingerprint).toBe(expected);
  });
});
