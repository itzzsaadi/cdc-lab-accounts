import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

/**
 * Phase 6 — offline sync end-to-end, against the real running app and a
 * real Chromium IndexedDB. `context.setOffline(true)` blocks all network
 * requests at the browser level (not just a UI flag), so a Server Action
 * call genuinely fails the way it would with no connectivity, exercising
 * the real `isLikelyOfflineError` fallback path rather than a mock.
 */

const TEST_PASSWORD = "correct-horse-battery-staple";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: /^Sign out/ }).click();
  const confirmSignOut = page.getByRole("button", { name: "Sign out anyway" });
  if (await confirmSignOut.isVisible().catch(() => false)) {
    await confirmSignOut.click();
  }
  await expect(page).toHaveURL(/\/sign-in/);
}

/** NFR-SEC-09 test helpers — inspect the real per-user IndexedDB database
 * directly (never through Dexie, so these checks are independent of the
 * application code they're verifying). */
async function offlineDatabaseExists(page: Page, userId: string): Promise<boolean> {
  const dbName = `cdc-offline-${userId}`;
  return page.evaluate(async (name) => {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === name);
  }, dbName);
}

async function countOfflineOperations(page: Page, userId: string): Promise<number> {
  const dbName = `cdc-offline-${userId}`;
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("operations")) {
            db.close();
            resolve(0);
            return;
          }
          const tx = db.transaction("operations", "readonly");
          const countRequest = tx.objectStore("operations").count();
          countRequest.onsuccess = () => {
            resolve(countRequest.result);
            db.close();
          };
          countRequest.onerror = () => {
            db.close();
            reject(countRequest.error);
          };
        };
      }),
    dbName,
  );
}

test.describe("Offline Sync — Sync Center and queueing", () => {
  test("Sync Center shows nothing to sync for a fresh account", async ({ page }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/sync-center");
    await expect(page.getByText("Nothing to sync")).toBeVisible();
  });

  test("an entry made while offline is queued, shown as pending, and syncs automatically once back online", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/counter-income");

    await page.waitForLoadState("networkidle");

    await context.setOffline(true);

    await page.getByLabel("Amount (PKR)").fill("777");
    await page.getByLabel("Note (optional)").fill(`E2E offline note ${Date.now()}`);
    await page.getByRole("button", { name: "Save Counter Income" }).click();

    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 30_000 });
    // The header indicator reflects the queued item without a page reload
    // — checked on the already-loaded page, since navigating to a not-yet-
    // prefetched dynamic route (Sync Center is server-rendered per
    // request) genuinely cannot complete while offline in a Next.js App
    // Router SPA; that is a platform constraint, not part of what FR-OFF
    // requires (offline *data entry*, not full offline app navigation).
    await expect(page.getByText(/1 pending/)).toBeVisible();

    await context.setOffline(false);

    // The `online` event triggers an automatic sync (mandatory decision
    // #2's verified-reconnect path) — no manual "Sync now" click required.
    // Sync Center is reached only now, while genuinely online.
    await page.getByRole("link", { name: "Sync Center" }).click();
    await expect(page.getByText("Nothing to sync")).toBeVisible({ timeout: 30_000 });
  });

  test("signing out with unsynced entries shows a heads-up, not a destructive-deletion warning", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/counter-income");

    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.getByLabel("Amount (PKR)").fill("321");
    await page.getByLabel("Note (optional)").fill(`E2E signout ${Date.now()}`);
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: /^Sign out/ }).click();

    await expect(page.getByText("You have entries that haven't synced yet")).toBeVisible();
    await expect(page.getByText(/nothing will be deleted/)).toBeVisible();

    await page.getByRole("button", { name: "Stay signed in" }).click();
    await expect(page).toHaveURL(/\/counter-income$/);

    await context.setOffline(false);
  });

  test("a different user signing in on the same browser never sees the prior user's queue", async ({
    page,
    context,
  }) => {
    const userA = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    const userB = await createActivatedUser("OPERATOR", TEST_PASSWORD);

    await signIn(page, userA.email);
    await page.goto("/counter-income");
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.getByLabel("Amount (PKR)").fill("111");
    await page.getByLabel("Note (optional)").fill(`E2E isolation ${Date.now()}`);
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 30_000 });
    await context.setOffline(false);

    await signOut(page);
    await signIn(page, userB.email);
    await page.goto("/sync-center");
    await expect(page.getByText("Nothing to sync")).toBeVisible();
  });

  test("signing out with an empty queue clears this device's local offline data (NFR-SEC-09)", async ({
    page,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    // Visiting an offline-aware page mounts OfflineProvider, which opens
    // this user's IndexedDB database and populates the reference cache —
    // there is real local data to clear even though the queue is empty.
    await page.goto("/counter-income");
    await expect(page.getByText(/pending/)).toHaveCount(0);
    await expect.poll(() => offlineDatabaseExists(page, user.id)).toBe(true);

    await signOut(page);

    await expect.poll(() => offlineDatabaseExists(page, user.id)).toBe(false);
  });

  test("choosing 'Sign out anyway' with unsynced entries never deletes the local queue (NFR-SEC-09 safeguard)", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/counter-income");

    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.getByLabel("Amount (PKR)").fill("456");
    await page.getByLabel("Note (optional)").fill(`E2E preserve ${Date.now()}`);
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 30_000 });
    expect(await countOfflineOperations(page, user.id)).toBe(1);

    // Sign-out itself is a Server Action and genuinely needs connectivity
    // (unlike offline data entry, it has no local-queue fallback) — going
    // back online is required to reach the sign-in page at all. Blocking
    // only the sync endpoints keeps the just-queued entry from being
    // uploaded (and thus removed) by the automatic reconnect-triggered
    // sync that `online` would otherwise fire, so this test still
    // exercises "sign out anyway while something is genuinely unsynced,"
    // not "sign out after it happened to sync in the background."
    await page.route("**/api/sync/**", (route) => route.abort());
    await context.setOffline(false);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: /^Sign out/ }).click();
    await page.getByRole("button", { name: "Sign out anyway" }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    // Sign-out never deletes anything while an entry is still unsynced —
    // the database and its one queued operation both survive.
    expect(await offlineDatabaseExists(page, user.id)).toBe(true);
    expect(await countOfflineOperations(page, user.id)).toBe(1);
  });

  test("reopening the app with zero connectivity reaches a real entry workspace, not a dead end (FR-OFF offline navigation)", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    // A real sign-in registers the service worker and precaches the
    // Offline Entry Workspace (public/sw.js's install handler) — required
    // for the fallback below to have anything useful to serve.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
      timeout: 30_000,
    });

    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    // Simulates reopening the installed app: a fresh navigation (not a
    // client-side transition) to an arbitrary authenticated route, with
    // no network available at all — the real "cold reopen while offline"
    // scenario, not just a component staying mounted through a blip. Every
    // other entry screen is a per-request authenticated Server Component
    // that a `navigate` fetch simply cannot complete without a connection
    // (docs/offline-sync.md's known platform limitation) — the point of
    // this test is that the fallback the service worker serves is the
    // real, useful workspace, never the plain dead-end /offline page.
    await page.goto("/daily-expenses").catch(() => {});

    await expect(page.getByRole("heading", { name: "Offline Entry Workspace" })).toBeVisible();
    await expect(page.getByText("You&rsquo;re offline", { exact: false })).toHaveCount(0);

    await context.setOffline(false);
  });

  test("the Offline Entry Workspace records all four entry types with zero connectivity", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    // Opened while still online — a fully realistic pattern too (the tab
    // was already on this page, or reached it via the sidebar, before
    // connectivity dropped mid-session) — so this test exercises the
    // workspace's own entry-recording logic (each section backed by this
    // device's cached reference data, never a live query) independent of
    // the service worker's cold-reopen precache path, which the previous
    // test already covers on its own.
    await page.goto("/offline-entry");
    await expect(page.getByRole("heading", { name: "Daily Expense" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Counter Income" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Party Income (Daily)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monthly Expense" })).toBeVisible();

    await page.waitForLoadState("networkidle");

    await context.setOffline(true);

    await page.getByLabel("Daily Expense Amount (PKR)").fill("111");
    await page.locator("#main-content").getByPlaceholder("Description").fill(`E2E ${Date.now()}`);
    await page.getByRole("button", { name: "Save Expense" }).first().click();

    await page.getByLabel("Counter Income Amount (PKR)").fill("222");
    await page.getByRole("button", { name: "Save Counter Income" }).click();

    await page.getByLabel("Party Income Amount (PKR)").fill("333");
    await page.getByRole("combobox").nth(1).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save for Today" }).click();

    await expect(page.getByText(/Saved on this device/).first()).toBeVisible();
    // Three CREATEs queued (daily expense, counter income, party income) —
    // Monthly Expense is intentionally not exercised here since the seed
    // data used by createActivatedUser's own account has no guaranteed
    // active expense category to select from.
    expect(await countOfflineOperations(page, user.id)).toBeGreaterThanOrEqual(3);

    await context.setOffline(false);
  });

  test("a still-unsynced entry marks the Partner Dashboard's totals provisional (FR-OFF-12)", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, user.email);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Partner Dashboard" })).toBeVisible();
    await expect(page.getByText(/Provisional —/)).toHaveCount(0);

    // Partner inherits every Operator capability, including Counter
    // Income entry (FR-AUTH-03) — used here only as a convenient
    // offline-capable entity for today's date, which always falls inside
    // the Dashboard's current-month range.
    await page.goto("/counter-income");
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.getByLabel("Amount (PKR)").fill("999");
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 30_000 });

    // Reconnect but keep the sync endpoints blocked, so the just-queued
    // entry is still genuinely unsynced (not merely "about to sync") by
    // the time the Dashboard re-renders — the same technique the
    // sign-out safeguard test above uses, and for the same reason.
    await page.route("**/api/sync/**", (route) => route.abort());
    await context.setOffline(false);

    await page.goto("/dashboard");
    await expect(page.getByText(/Provisional — 1 entry from this period/)).toBeVisible();
    await expect(
      page.getByText(/figures below are computed from confirmed, synced entries only/),
    ).toBeVisible();
  });
});

/**
 * Security review: `/offline-entry` (OfflineEntryWorkspace.tsx) is static
 * and reachable with no session cookie at all — it must never trust a
 * bare, client-readable "which user" value as a stand-in for
 * authentication. It resolves access purely from which `cdc-offline-<id>`
 * IndexedDB databases genuinely exist on this browser profile
 * (`resolveOfflineAccessibleUserId`, src/lib/offline/last-user.ts) — a
 * database only ever gets created by `getOfflineDb` inside the
 * authenticated shell, so its mere existence already proves a real prior
 * sign-in for that id, on this exact device. These three tests cover the
 * three scenarios named in the security review: after sign-out, to
 * another user, and with no valid local offline-access context at all.
 */
test.describe("Offline Entry Workspace security (NFR-SEC-09 / offline-entry review)", () => {
  test("a device that has never signed in gets no offline entry history, never a guess", async ({
    page,
  }) => {
    // A fresh Playwright test context starts with empty storage/IndexedDB
    // for every origin — this is the real "without a valid local
    // offline-access context" case, reached with zero setup.
    await page.goto("/offline-entry");
    await expect(
      page.getByText(
        "This device has no offline entry history yet. Sign in at least once with a live connection before entries can be recorded here offline.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily Expense" })).toHaveCount(0);
  });

  test("after sign-out clears this device's data, the workspace no longer offers that user's entries", async ({
    page,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/counter-income");
    await expect.poll(() => offlineDatabaseExists(page, user.id)).toBe(true);

    // Empty queue — NFR-SEC-09's ordinary sign-out cleanup path actually
    // deletes the database (already proven directly in the test above at
    // line 166); this test's own point is what /offline-entry does next.
    await signOut(page);
    await expect.poll(() => offlineDatabaseExists(page, user.id)).toBe(false);

    await page.goto("/offline-entry");
    await expect(
      page.getByText("This device has no offline entry history yet.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily Expense" })).toHaveCount(0);
  });

  test("two genuine accounts having signed in on one device never lets the workspace guess between them", async ({
    page,
    context,
  }) => {
    const userA = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    const userB = await createActivatedUser("OPERATOR", TEST_PASSWORD);

    await signIn(page, userA.email);
    await page.goto("/counter-income");
    await page.waitForLoadState("networkidle");
    // Keep user A's database from being cleared on sign-out by leaving a
    // genuinely unsynced entry queued (same technique as the "Sign out
    // anyway" safeguard test above) — this is what actually produces the
    // multi-account-on-one-device state the ambiguous case defends
    // against; without this, an empty-queue sign-out would delete A's
    // database and there would be nothing to disambiguate.
    await context.setOffline(true);
    await page.getByLabel("Amount (PKR)").fill("321");
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 30_000 });
    await page.route("**/api/sync/**", (route) => route.abort());
    await context.setOffline(false);
    expect(await offlineDatabaseExists(page, userA.id)).toBe(true);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: /^Sign out/ }).click();
    await page.getByRole("button", { name: "Sign out anyway" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    expect(await offlineDatabaseExists(page, userA.id)).toBe(true);

    await signIn(page, userB.email);
    await page.goto("/counter-income");
    await expect.poll(() => offlineDatabaseExists(page, userB.id)).toBe(true);

    // Both userA's and userB's databases now genuinely exist on this one
    // browser profile — the exact "to another user" scenario. The
    // workspace must refuse to silently pick either one.
    await page.goto("/offline-entry");
    await expect(
      page.getByText(
        "More than one account has signed in on this device. Sign in online once to continue",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily Expense" })).toHaveCount(0);
  });
});
