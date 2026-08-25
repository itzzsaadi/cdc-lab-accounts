"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";
import { mergeFilterParams } from "../../lib/navigation/filter-query";

/**
 * The one place every filterable screen's filter bar drives navigation
 * from (daily-expenses, assets, audit-log — "apply this consistently to
 * every filterable screen"). `currentParams` is the raw, already-parsed
 * query object the server component read for this render; every call
 * here merges into that, so any param this filter bar doesn't itself own
 * is preserved untouched.
 *
 * `router.replace` never performs a full document navigation/unload — it
 * only updates the URL and re-renders the Server Component with the new
 * `searchParams` — so this is also what removes filter changes from ever
 * being able to trigger the `beforeunload` "Leave site?" prompt
 * (OfflineProvider's listener only fires on a real unload, which a
 * `router.replace` never is).
 */
export function useFilterNavigation(currentParams: Record<string, string | undefined>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const navigate = useCallback(
    (updates: Record<string, string | undefined>, options?: { keepCursor?: boolean }) => {
      const query = mergeFilterParams(currentParams, updates, options);
      const qs = query.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [currentParams, pathname, router],
  );

  /** Select filters and complete/valid date changes apply immediately. */
  const applyNow = useCallback(
    (updates: Record<string, string | undefined>) => navigate(updates),
    [navigate],
  );

  /** Free-text search — ~300ms debounce so every keystroke doesn't fire a request. */
  const applyDebounced = useCallback(
    (updates: Record<string, string | undefined>, delayMs = 300) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => navigate(updates), delayMs);
    },
    [navigate],
  );

  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    startTransition(() => router.replace(pathname));
  }, [pathname, router]);

  return { applyNow, applyDebounced, reset, isPending };
}
