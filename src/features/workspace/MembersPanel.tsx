"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { MemberRole } from "@/src/core/models/enums";
import type { MemberView } from "@/src/core/sync/types";
import { CustomRoles, rolesKey } from "@/src/features/workspace/CustomRoles";

const ROLES: MemberRole[] = ["owner", "approver", "member"];
const INVITE_ROLES: Array<Exclude<MemberRole, "owner">> = ["approver", "member"];

type Props = {
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
};

export function MembersPanel({ workspaceId, currentUserId, canManage }: Props) {
  const queryClient = useQueryClient();
  const [inviteRole, setInviteRole] =
    useState<Exclude<MemberRole, "owner">>("member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => api.listMembers(workspaceId),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.createInvite(workspaceId, inviteRole),
    onSuccess: (result) => {
      setInviteUrl(result.invite.url);
      setCopied(false);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const roles = useQuery({ queryKey: rolesKey(workspaceId), queryFn: () => api.listRoles(workspaceId) });
  const customRoles = roles.data?.roles ?? [];

  const roleMutation = useMutation({
    mutationFn: ({ userId, role, customRoleId }: { userId: string; role: MemberRole; customRoleId?: string | null }) =>
      api.updateMember(workspaceId, userId, role, customRoleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.removeMember(workspaceId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
  });

  const members = membersQuery.data?.members ?? [];

  /** A built-in role ("member") or a custom one ("custom:<id>"), as the role picker holds it. */
  const pickRole = (member: MemberView, value: string) => {
    if (value.startsWith("custom:")) {
      // A custom role decides what they may do; an owner given one becomes a member with it.
      roleMutation.mutate({ userId: member.userId, role: member.role === "owner" ? "member" : member.role, customRoleId: value.slice(7) });
    } else {
      roleMutation.mutate({ userId: member.userId, role: value as MemberRole, customRoleId: null });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="surface grain rounded-[var(--r-lg)] p-4">
          <h2 className="text-sm font-medium text-[var(--foreground)]">Invite link</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Copy a one-time link. It expires in 7 days.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as Exclude<MemberRole, "owner">)
              }
              className="h-10 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm text-[var(--foreground)]"
            >
              {INVITE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => inviteMutation.mutate()}
              className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
            >
              Generate link
            </button>
          </div>
          {inviteUrl ? (
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="h-10 flex-1 truncate rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-xs text-[var(--foreground)]"
              />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                }}
                className="h-10 rounded-lg border border-[var(--hairline)] px-3 text-sm text-[var(--muted-foreground)]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden surface grain rounded-[var(--r-lg)]">
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--hairline)]">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              {canManage ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-3">
                  <p className="text-[var(--foreground)]">{member.displayName}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{member.email}</p>
                </td>
                <td className="px-4 py-3">
                  {canManage && member.userId !== currentUserId ? (
                    <select
                      aria-label={`Role of ${member.displayName}`}
                      value={member.customRoleId ? `custom:${member.customRoleId}` : member.role}
                      onChange={(event) => pickRole(member, event.target.value)}
                      className="h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-xs text-[var(--foreground)]"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                      {customRoles.map((r) => (
                        <option key={r.id} value={`custom:${r.id}`}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-mono text-xs uppercase text-[var(--muted-foreground)]">
                      {member.customRoleName ?? member.role}
                    </span>
                  )}
                </td>
                {canManage ? (
                  <td className="px-4 py-3 text-right">
                    {member.userId !== currentUserId ? (
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(member.userId)}
                        className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]"
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {canManage ? <CustomRoles workspaceId={workspaceId} /> : null}
      {error ? (
        <p className="text-sm text-[var(--balance-negative)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
