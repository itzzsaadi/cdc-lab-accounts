"use client";

import { useState } from "react";
import { useFilterNavigation } from "./useFilterNavigation";
import { useSyncedState } from "./useSyncedState";
import { FilterBarShell } from "./FilterBarShell";
import { isValidDateRange } from "../../lib/navigation/filter-query";

/** FR-AUD-04's filter bar. A filter change always drops `cursor` (keyset pagination restarts from page one) — `useFilterNavigation`'s default behavior, not something this component has to remember to do itself. */
export function AuditLogFilters({
  currentParams,
  actorUserId,
  entityType,
  from,
  to,
  actors,
  entityTypeOptions,
}: {
  currentParams: Record<string, string | undefined>;
  actorUserId: string;
  entityType: string;
  from: string;
  to: string;
  actors: { id: string; fullName: string }[];
  entityTypeOptions: string[];
}) {
  const { applyNow, reset, isPending } = useFilterNavigation(currentParams);
  const [localActorUserId, setLocalActorUserId] = useSyncedState(actorUserId);
  const [localEntityType, setLocalEntityType] = useSyncedState(entityType);
  const [localFrom, setLocalFrom] = useSyncedState(from);
  const [localTo, setLocalTo] = useSyncedState(to);
  const [rangeError, setRangeError] = useState(false);

  function handleDateChange(next: { from?: string; to?: string }) {
    const nextFrom = next.from ?? localFrom;
    const nextTo = next.to ?? localTo;
    if (next.from !== undefined) setLocalFrom(next.from);
    if (next.to !== undefined) setLocalTo(next.to);
    if (!isValidDateRange(nextFrom, nextTo)) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    applyNow({ from: nextFrom, to: nextTo });
  }

  const filtersActive = Boolean(
    currentParams.actorUserId || currentParams.entityType || currentParams.from || currentParams.to,
  );

  return (
    <FilterBarShell
      isPending={isPending}
      showReset={filtersActive}
      onReset={() => {
        setLocalActorUserId("");
        setLocalEntityType("");
        setLocalFrom("");
        setLocalTo("");
        setRangeError(false);
        reset();
      }}
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-actor"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          User
        </label>
        <select
          id="filter-actor"
          value={localActorUserId}
          onChange={(event) => {
            setLocalActorUserId(event.target.value);
            applyNow({ actorUserId: event.target.value });
          }}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">All users</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.fullName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-entity-type"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          Record Type
        </label>
        <select
          id="filter-entity-type"
          value={localEntityType}
          onChange={(event) => {
            setLocalEntityType(event.target.value);
            applyNow({ entityType: event.target.value });
          }}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        >
          <option value="">All types</option>
          {entityTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-date-from"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          From
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={localFrom}
          onChange={(event) => handleDateChange({ from: event.target.value })}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="filter-date-to"
          className="text-on-surface-variant text-xs font-medium uppercase"
        >
          To
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={localTo}
          onChange={(event) => handleDateChange({ to: event.target.value })}
          className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
        />
      </div>
      {rangeError ? (
        <p role="alert" className="text-error self-end pb-3 text-xs">
          From date must be on or before To date.
        </p>
      ) : null}
    </FilterBarShell>
  );
}
