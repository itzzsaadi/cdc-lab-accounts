/**
 * One field's before/after comparison for a single audit log row.
 * `before`/`after` are `undefined` (not `null`) when the field simply
 * wasn't present in that side's JSON blob — a Created row has no `before`
 * side at all, so every field there is "new," never "changed from
 * nothing."
 */
export interface AuditFieldDiff {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

/**
 * FR-AUD-05's field-by-field before/after listing, extracted as a pure
 * function so the exact shape it returns is unit-testable independent of
 * how `HistoryButton` renders it. Each key appears exactly once in the
 * result — the caller must not need to special-case "field didn't exist
 * before" as a second, separately-rendered branch, since that duplicated
 * the same `after` value both as the "changed" branch and as its own
 * fallback branch (the real cause of the History card showing e.g.
 * `1456` and `1456` concatenated as `14561456`).
 */
export function diffAuditValues(oldValues: unknown, newValues: unknown): AuditFieldDiff[] {
  const oldRecord = (oldValues && typeof oldValues === "object" ? oldValues : {}) as Record<
    string,
    unknown
  >;
  const newRecord = (newValues && typeof newValues === "object" ? newValues : {}) as Record<
    string,
    unknown
  >;
  const keys = Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])).sort();

  return keys.map((key) => {
    const before = oldRecord[key];
    const after = newRecord[key];
    return { key, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  });
}
