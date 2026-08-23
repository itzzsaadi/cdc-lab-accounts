"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Select } from "../ui/Select";
import { Checkbox } from "../ui/Checkbox";
import { Modal } from "../ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "../ui/Table";
import { Alert } from "../ui/Alert";
import {
  inviteUserAction,
  reissueInvitationAction,
  deactivateUserAction,
  reactivateUserAction,
  changeUserRoleAction,
} from "../../server/actions/auth";

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: "OPERATOR" | "PARTNER" | "ADMIN";
  isPartner: boolean;
  isActive: boolean;
  hasAcceptedInvitation: boolean;
}

/** FR-AUTH-03. Invite, reissue, role/partner-flag change, and deactivate/reactivate — every action calls the corresponding Server Action, which independently re-checks permission and (for role/deactivate changes) is backed by the database's own last-active-Admin and partner-flag-removal guards (phase7_administration_and_import migration). This component only surfaces whatever error message that action returns; it never second-guesses it client-side. */
export function UserManager({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"OPERATOR" | "PARTNER" | "ADMIN">("OPERATOR");
  const [inviteIsPartner, setInviteIsPartner] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<"OPERATOR" | "PARTNER" | "ADMIN">("OPERATOR");
  const [editIsPartner, setEditIsPartner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await inviteUserAction({
      email: inviteEmail,
      role: inviteRole,
      isPartner: inviteIsPartner,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInviteOpen(false);
    setInviteEmail("");
    router.refresh();
  }

  function openEdit(row: UserRow) {
    setEditing(row);
    setEditRole(row.role);
    setEditIsPartner(row.isPartner);
    setError(null);
  }

  async function handleRoleChange(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const result = await changeUserRoleAction({
      userId: editing.id,
      role: editRole,
      isPartner: editIsPartner,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function handleReissue(userId: string) {
    setError(null);
    const result = await reissueInvitationAction(userId);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function handleDeactivate(userId: string) {
    setError(null);
    const result = await deactivateUserAction(userId);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function handleReactivate(userId: string) {
    setError(null);
    const result = await reactivateUserAction(userId);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-on-surface text-lg font-semibold">Users</h2>
        <Button type="button" onClick={() => setInviteOpen(true)}>
          <span className="material-symbols-outlined text-[20px]">add</span>
          Invite User
        </Button>
      </div>
      {error ? <Alert variant="warning">{error}</Alert> : null}
      <Table>
        <Thead>
          <Tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Partner</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td>{row.fullName}</Td>
              <Td>{row.email}</Td>
              <Td>{row.role}</Td>
              <Td>{row.isPartner ? "Yes" : "No"}</Td>
              <Td>{row.isActive ? "Active" : "Inactive"}</Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => openEdit(row)}>
                    Change Role
                  </Button>
                  {!row.hasAcceptedInvitation ? (
                    <Button type="button" variant="secondary" onClick={() => handleReissue(row.id)}>
                      Reissue Invite
                    </Button>
                  ) : null}
                  {row.isActive ? (
                    <Button
                      type="button"
                      variant="destructive-ghost"
                      onClick={() => handleDeactivate(row.id)}
                      disabled={row.id === currentUserId}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleReactivate(row.id)}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite User">
        <form onSubmit={handleInvite} className="flex flex-col gap-4">
          <TextInput
            id="invite-email"
            label="Email Address"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <Select
            id="invite-role"
            label="Role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "OPERATOR" | "PARTNER" | "ADMIN")}
          >
            <option value="OPERATOR">Operator</option>
            <option value="PARTNER">Partner</option>
            <option value="ADMIN">Admin</option>
          </Select>
          <Checkbox
            id="invite-is-partner"
            label="Partner (eligible for profit-split mapping)"
            checked={inviteIsPartner}
            onChange={(e) => setInviteIsPartner(e.target.checked)}
          />
          {error ? <p className="text-error text-sm">{error}</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send Invitation"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Change Role">
        <form onSubmit={handleRoleChange} className="flex flex-col gap-4">
          <Select
            id="edit-role"
            label="Role"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value as "OPERATOR" | "PARTNER" | "ADMIN")}
          >
            <option value="OPERATOR">Operator</option>
            <option value="PARTNER">Partner</option>
            <option value="ADMIN">Admin</option>
          </Select>
          <Checkbox
            id="edit-is-partner"
            label="Partner (eligible for profit-split mapping)"
            checked={editIsPartner}
            onChange={(e) => setEditIsPartner(e.target.checked)}
          />
          {error ? <p className="text-error text-sm">{error}</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
