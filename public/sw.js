// CDC Lab Accounts System — service worker (FR-OFF, CLAUDE.md Phase 6
// mandatory decisions #6/#7). Static and dependency-free by design — no
// bundler, no Workbox, nothing generated. Bump CACHE_VERSION whenever this
// file's caching logic changes (not on every app deploy — Next.js's own
// /_next/static/ assets are already content-hashed, so they never go
// stale under an unchanged cache name); activate() deletes every
// previously-versioned cache this service worker owns, so a bumped
// version never leaves an orphaned cache around.
//
// What this file is NOT: it never caches anything under /api/ (no
// authenticated API response is ever stored here), and it never caches a
// page's server-rendered HTML except the one dedicated, genuinely static
// /offline fallback route — every other page carries live financial data
// and must always be fetched fresh. Background Sync (the `sync` event
// below) is registered purely as an enhancement: it only posts a message
// suggesting an open tab attempt a sync, exactly once support/permission
// allow it to fire at all — it is never the dependable path, since this
// worker has no Dexie/TypeScript runtime to actually perform an upload,
// and browser support for the Background Sync API itself is inconsistent.
// The page-side sync engine (src/lib/offline/sync-engine.ts) is what
// actually drives every real sync attempt.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `cdc-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const STATIC_ASSET_PATTERNS = [
  /^\/_next\/static\//,
  /^\/manifest-icons\//,
  /^\/icon$/,
  /^\/apple-icon$/,
  /^\/manifest\.webmanifest$/,
  /^\/fonts\//,
];

function isStaticAsset(pathname) {
  return STATIC_ASSET_PATTERNS.some((pattern) => pattern.test(pathname));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("cdc-") && name !== STATIC_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return; // never intercept a mutating request
  }

  const url = new URL(request.url);

  // Authenticated API responses and anything under /api/ are never
  // touched by this service worker at all -- no caching, no offline
  // fallback substitution, nothing. The fetch proceeds exactly as if no
  // service worker were installed.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    // Every page carries live, financial, per-request data -- it is never
    // cached. Only the network response is ever served for a successful
    // request; a failed (offline) navigation falls back to the one
    // static, non-financial /offline page.
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(STATIC_CACHE).then((cache) => cache.match(OFFLINE_URL)),
      ),
    );
    return;
  }

  // Everything else (e.g. a same-origin request this list doesn't
  // recognize) passes through untouched -- no caching, no interception.
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "cdc-offline-sync") {
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({ type: "BACKGROUND_SYNC_HINT" });
      }
    }),
  );
});
