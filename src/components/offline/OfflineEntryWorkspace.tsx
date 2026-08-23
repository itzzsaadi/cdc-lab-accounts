"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getOfflineDb } from "../../lib/offline/db";
import { enqueueOperation } from "../../lib/offline/queue";
import { runSync } from "../../lib/offline/sync-engine";
import { getLastKnownUserId } from "../../lib/offline/last-user";
import { generateClientUuid } from "../../lib/client-uuid";
import { todayInKarachi, currentYearMonthInKarachi } from "../../lib/domain/calendar-date";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import type { OfflineDatabase } from "../../lib/offline/db";
import type { OfflineEntityType } from "../../lib/offline/types";

/**
 * FR-OFF: a genuinely static, unauthenticated shell (no `headers()`,
 * `cookies()`, or Prisma call anywhere in its render path — see
 * `src/app/offline-entry/page.tsx`) precached by the service worker so it
 * is reachable after reopening the installed app with zero connectivity,
 * unlike every other entry screen (each one a per-request, authenticated
 * Server Component that a `navigate` fetch cannot complete without a live
 * connection — see `public/sw.js` and `docs/offline-sync.md`'s "known
 * platform limitation" note). It never renders financial data itself: no
 * totals, no history, no other user's figures — only the four
 * entry-creation forms, each backed entirely by this device's own
 * already-cached reference data (parties/items/categories/vendors,
 * refreshed during normal online use — see reference-cache.ts) and the
 * same `enqueueOperation` used everywhere else in the offline queue.
 * Submissions always queue locally here (there is no live Server Action
 * to attempt in the first place while this page is the one actually
 * reachable) and sync exactly like any other queued entry once back
 * online — through this page's own "Sync now" button, or automatically
 * the next time any ordinary authenticated page mounts `OfflineProvider`.
 */
/** No `window`/`localStorage` at all during SSR/static generation, so the
 * server snapshot is a fixed `null` (matching OfflineProvider.tsx's
 * identical `isOnline` pattern for the same reason) — the real value is
 * read only after hydration, avoiding a mismatch between server and
 * client markup for what is otherwise indistinguishable from "no history
 * yet." Nothing here ever changes without a full reload, so `subscribe`
 * never actually needs to fire its callback. */
function subscribeToLastUserId() {
  return () => {};
}
function getLastUserIdServerSnapshot() {
  return null;
}

export function OfflineEntryWorkspace() {
  const userId = useSyncExternalStore(
    subscribeToLastUserId,
    getLastKnownUserId,
    getLastUserIdServerSnapshot,
  );

  if (userId === null) {
    return (
      <Alert variant="info">
        This device has no offline entry history yet. Sign in at least once with a live connection
        before entries can be recorded here offline.
      </Alert>
    );
  }

  return <WorkspaceForUser userId={userId} />;
}

function WorkspaceForUser({ userId }: { userId: string }) {
  const db = getOfflineDb(userId);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const pendingCount = useLiveQuery(() => db.operations.count(), [db], 0);

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      await runSync(db);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="info">
        Every entry below is saved on this device and will sync automatically the next time
        you&rsquo;re online — nothing here requires a live connection to save.
        {pendingCount > 0
          ? ` ${pendingCount} ${pendingCount === 1 ? "entry is" : "entries are"} currently waiting to sync.`
          : null}
      </Alert>
      {savedNotice ? <Alert variant="warning">{savedNotice}</Alert> : null}

      <div className="flex items-center justify-between">
        <p className="text-on-surface-variant text-sm">
          Entries you don&rsquo;t have permission for (e.g. Monthly Expenses as an Operator) will be
          rejected once they sync — the same rule as everywhere else in the app.
        </p>
        <Button type="button" onClick={handleSyncNow} disabled={isSyncing}>
          {isSyncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      <DailyExpenseSection db={db} onSaved={setSavedNotice} />
      <CounterIncomeSection db={db} onSaved={setSavedNotice} />
      <PartyIncomeSection db={db} onSaved={setSavedNotice} />
      <MonthlyExpenseSection db={db} onSaved={setSavedNotice} />
    </div>
  );
}

async function enqueueAndNotify(
  db: OfflineDatabase,
  entityType: OfflineEntityType,
  payload: Record<string, unknown>,
  onSaved: (message: string) => void,
) {
  const clientUuid = generateClientUuid();
  await enqueueOperation(db, {
    operationId: crypto.randomUUID(),
    entityType,
    action: "CREATE",
    clientUuid,
    payload: { ...payload, capturedAt: new Date().toISOString() },
  });
  onSaved("Saved on this device — will sync once you're back online.");
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="text-on-surface mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function DailyExpenseSection({
  db,
  onSaved,
}: {
  db: OfflineDatabase;
  onSaved: (message: string) => void;
}) {
  // Booleans aren't a valid IndexedDB key type, so `isActive` (declared as
  // an index in db.ts for potential future use) can't be queried via
  // `.where(...).equals(...)` — filter the small cached array in JS
  // instead, which is what every other reference-cache read in this file
  // does too.
  const items = useLiveQuery(
    () => db.expenseItems.toArray().then((rows) => rows.filter((r) => r.isActive)),
    [db],
    [],
  );
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseItemId, setExpenseItemId] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await enqueueAndNotify(
      db,
      "daily_expense",
      {
        expenseDate: todayInKarachi(),
        expenseItemId: expenseItemId || undefined,
        customDescription: expenseItemId ? undefined : description,
        amount,
        fundingSource: "BUSINESS",
      },
      onSaved,
    );
    setDescription("");
    setAmount("");
    setExpenseItemId("");
  }

  return (
    <SectionCard title="Daily Expense">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <select
          value={expenseItemId}
          onChange={(e) => setExpenseItemId(e.target.value)}
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">Other (type below)</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {!expenseItemId ? (
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
          />
        ) : null}
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount (PKR)"
          aria-label="Daily Expense Amount (PKR)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        />
        <p className="text-on-surface-variant text-xs">
          Funding source: Business (Partner-funded expenses aren&rsquo;t available offline — record
          those once you&rsquo;re back online).
        </p>
        <Button type="submit">Save Expense</Button>
      </form>
    </SectionCard>
  );
}

function CounterIncomeSection({
  db,
  onSaved,
}: {
  db: OfflineDatabase;
  onSaved: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await enqueueAndNotify(
      db,
      "counter_income",
      { incomeDate: todayInKarachi(), amount, note: note || undefined, confirmedDuplicate: true },
      onSaved,
    );
    setAmount("");
    setNote("");
  }

  return (
    <SectionCard title="Counter Income">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount (PKR)"
          aria-label="Counter Income Amount (PKR)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        />
        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        />
        <Button type="submit">Save Counter Income</Button>
      </form>
    </SectionCard>
  );
}

function PartyIncomeSection({
  db,
  onSaved,
}: {
  db: OfflineDatabase;
  onSaved: (message: string) => void;
}) {
  const parties = useLiveQuery(
    () =>
      db.parties
        .toArray()
        .then((rows) => rows.filter((r) => r.isActive && r.billingMode === "DAILY")),
    [db],
    [],
  );
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!partyId) return;
    await enqueueAndNotify(
      db,
      "party_income_daily",
      { partyId, incomeDate: todayInKarachi(), amount },
      onSaved,
    );
    setAmount("");
  }

  if (parties.length === 0) {
    return (
      <SectionCard title="Party Income (Daily)">
        <p className="text-on-surface-variant text-sm">
          No daily-billing parties are cached on this device yet — connect once online to populate
          this list.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Party Income (Daily)">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <select
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
          required
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">Select a party…</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount (PKR)"
          aria-label="Party Income Amount (PKR)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        />
        <Button type="submit">Save for Today</Button>
      </form>
    </SectionCard>
  );
}

function MonthlyExpenseSection({
  db,
  onSaved,
}: {
  db: OfflineDatabase;
  onSaved: (message: string) => void;
}) {
  const categories = useLiveQuery(
    () => db.expenseCategories.toArray().then((rows) => rows.filter((r) => r.isActive)),
    [db],
    [],
  );
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!categoryId) return;
    await enqueueAndNotify(
      db,
      "monthly_expense",
      {
        periodMonth: currentYearMonthInKarachi(),
        categoryId,
        amount,
        fundingSource: "BUSINESS",
      },
      onSaved,
    );
    setAmount("");
  }

  if (categories.length === 0) {
    return (
      <SectionCard title="Monthly Expense">
        <p className="text-on-surface-variant text-sm">
          No expense categories are cached on this device yet — connect once online to populate this
          list.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Monthly Expense">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">Select a category…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Amount (PKR)"
          aria-label="Monthly Expense Amount (PKR)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="border-outline-variant h-11 rounded-lg border px-3 text-sm"
        />
        <p className="text-on-surface-variant text-xs">
          Partner/Admin only — recorded against the current calendar month, Business-funded.
        </p>
        <Button type="submit">Save Expense</Button>
      </form>
    </SectionCard>
  );
}
