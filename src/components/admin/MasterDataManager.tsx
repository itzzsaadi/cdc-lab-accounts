"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Modal } from "../ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "../ui/Table";
import { Alert } from "../ui/Alert";

export interface MasterDataRow {
  id: string;
  name: string;
  isActive: boolean;
  updatedAt: string | null;
  extraLabel?: string;
  /** Entity-specific values (Party's billingMode/sortOrder, Category's expenseGroup/isRecurring) — opaque to this component, read only by the caller's own `extraFields` renderer. */
  extra?: Record<string, unknown>;
}

type MutationResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Shared list + create/rename + archive/reactivate UI for the four
 * simple master-data entities (FR-MST-01/02/03/04) — each page supplies
 * its own entity label, rows, and the three server actions to call.
 * `extraFields` renders any entity-specific inputs inside the same
 * create/edit dialog (Party's billing mode + sort order, Category's
 * expense group + recurring) without this component needing to know
 * their shape.
 */
export function MasterDataManager({
  entityLabel,
  itemLabel,
  rows,
  onCreate,
  onUpdate,
  onArchiveOrReactivate,
  extraFields,
}: {
  entityLabel: string;
  /** Singular form of `entityLabel` for the "Add {itemLabel}" button — passed explicitly rather than derived by stripping a trailing "s", since that breaks for "Parties" and "Categories". */
  itemLabel: string;
  rows: MasterDataRow[];
  onCreate: (name: string, extra: FormData) => Promise<MutationResult>;
  onUpdate: (
    id: string,
    name: string,
    expectedUpdatedAt: string | null,
    extra: FormData,
  ) => Promise<MutationResult>;
  onArchiveOrReactivate: (
    id: string,
    isActive: boolean,
    expectedUpdatedAt: string | null,
  ) => Promise<MutationResult>;
  extraFields?: (editing: MasterDataRow | null) => ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterDataRow | null>(null);
  /**
   * NFR-USE-06: archiving a master-data record must be confirmed by name.
   * Reactivating is *not* confirmed — it restores availability rather than
   * withdrawing it, so the requirement's reason (guarding an irreversible-
   * looking, destructive-looking action) does not apply.
   */
  const [archiving, setArchiving] = useState<MasterDataRow | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setError(null);
    setOpen(true);
  }
  function openEdit(row: MasterDataRow) {
    setEditing(row);
    setName(row.name);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const result = editing
      ? await onUpdate(editing.id, name, editing.updatedAt, formData)
      : await onCreate(name, formData);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function handleArchiveToggle(row: MasterDataRow) {
    setArchiving(null);
    const result = await onArchiveOrReactivate(row.id, !row.isActive, row.updatedAt);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-on-surface text-lg font-semibold">{entityLabel}</h2>
        <Button type="button" onClick={openCreate}>
          <span className="material-symbols-outlined text-[20px]">add</span>
          Add {itemLabel}
        </Button>
      </div>
      {error ? <Alert variant="warning">{error}</Alert> : null}
      <Table>
        <Thead>
          <Tr>
            <Th>Name</Th>
            {rows.some((r) => r.extraLabel) ? <Th>Details</Th> : null}
            <Th>Status</Th>
            <Th>Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td>{row.name}</Td>
              {rows.some((r) => r.extraLabel) ? <Td>{row.extraLabel}</Td> : null}
              <Td>{row.isActive ? "Active" : "Archived"}</Td>
              <Td>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => openEdit(row)}>
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant={row.isActive ? "destructive-ghost" : "secondary"}
                    aria-label={`${row.isActive ? "Archive" : "Reactivate"} ${row.name}`}
                    onClick={() =>
                      row.isActive ? setArchiving(row) : void handleArchiveToggle(row)
                    }
                  >
                    {row.isActive ? "Archive" : "Reactivate"}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Modal
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title={`Archive ${itemLabel}`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-on-surface-variant text-sm">
            Archive <span className="font-medium">{archiving?.name}</span>? It stops appearing in
            pickers for new entries. Every figure already recorded against it is unchanged and stays
            visible, and it can be reactivated at any time — nothing is deleted (FR-MST-05).
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setArchiving(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive-ghost"
              onClick={() => archiving && void handleArchiveToggle(archiving)}
            >
              Archive
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Rename" : `Add ${itemLabel}`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextInput
            id="master-data-name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {extraFields ? extraFields(editing) : null}
          {error ? <p className="text-error text-sm">{error}</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
