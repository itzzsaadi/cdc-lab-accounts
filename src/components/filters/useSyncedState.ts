"use client";

import { useState } from "react";

/**
 * Local state that mirrors a server-supplied value by default, but
 * reflects the user's own edits immediately (an onChange handler updates
 * it directly, without waiting for the URL round trip). When the prop
 * itself changes for a reason other than this component's own edit —
 * Reset Filters, browser back/forward, another filter's navigation — the
 * local value is resynchronized.
 *
 * This adjusts state during render (comparing against the previously
 * seen prop value) rather than in a `useEffect`, per React's own
 * guidance for "adjusting state when a prop changes" — a `useEffect` that
 * calls `setState` unconditionally on every prop change causes an extra,
 * avoidable render pass, which is exactly what
 * `react-hooks/set-state-in-effect` flags.
 */
export function useSyncedState(propValue: string) {
  const [prevPropValue, setPrevPropValue] = useState(propValue);
  const [value, setValue] = useState(propValue);
  if (propValue !== prevPropValue) {
    setPrevPropValue(propValue);
    setValue(propValue);
  }
  return [value, setValue] as const;
}
