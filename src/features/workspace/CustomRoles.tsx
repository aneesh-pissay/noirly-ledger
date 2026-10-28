"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { CUSTOM_ROLE_PERMISSIONS, PERMISSION_LABEL, type PermissionAction } from "@/src/core/permissions/can";
import type { CustomRoleView } from "@/src/core/sync/types";

/** Permissions a role can be given; seeing the workspace comes with every role. */
const CHOOSABLE = CUSTOM_ROLE_PERMISSIONS.filter((p) => p !== "workspace.read");

export function rolesKey(workspaceId: string) {
  return [...qk.members(workspaceId), "roles"] as const;
}

/** The workspace's own roles: make one from exactly the permissions it needs, change it, or delete it. Owners only. */
export function CustomRoles({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: rolesKey(workspaceId), queryFn: () => api.listRoles(workspaceId) });
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<PermissionAction[]>(["expense.submit"]);
  // Under the members key, so a role change refreshes who has what.
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
  const create = useMutation({
    mutationFn: () => api.createRole(workspaceId, { name, permissions: picked }),
    onSuccess: async () => {
      setName("");
      setPicked(["expense.submit"]);
      await refresh();
    },
  });
  const update = useMutation({ mutationFn: ({ id, permissions }: { id: string; permissions: PermissionAction[] }) => api.updateRole(workspaceId, id, { permissions }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteRole(workspaceId, id), onSuccess: refresh });
  const error = create.error ?? update.error ?? remove.error;
  const toggle = (list: PermissionAction[], p: PermissionAction) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]);

  const role = (r: CustomRoleView) => (
    <li key={r.id} data-role={r.name} className="space-y-2 border-t border-[var(--hairline)] pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{r.name}</p>
        <span className="text-xs text-[var(--muted-foreground)]">
          {r.memberCount} member{r.memberCount === 1 ? "" : "s"} ·{" "}
          <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete the ${r.name} role? Its members go back to their built-in role.`)) remove.mutate(r.id); }}>
            Delete
          </button>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {CHOOSABLE.map((p) => (
          <label key={p} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={r.permissions.includes(p)} disabled={update.isPending} onChange={() => update.mutate({ id: r.id, permissions: toggle(r.permissions, p) })} />
            {PERMISSION_LABEL[p]}
          </label>
        ))}
      </div>
    </li>
  );

  return (
    <section aria-label="Roles" className="surface grain space-y-4 rounded-[var(--r-lg)] p-4">
      <div>
        <h2 className="text-sm font-medium">Roles</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Beyond owner, approver and member: give a role exactly the permissions it needs, then pick it for members below. Running the workspace and its members stays with owners.
        </p>
      </div>
      {roles.data?.roles.length ? <ul className="space-y-3">{roles.data.roles.map(role)}</ul> : null}
      <form
        aria-label="New role"
        className="space-y-2 border-t border-[var(--hairline)] pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Role name"
            required
            maxLength={40}
            placeholder="New role, e.g. Bookkeeper"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-sm"
          />
          <button type="submit" disabled={create.isPending} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]">
            Add role
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {CHOOSABLE.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" aria-label={`New role: ${PERMISSION_LABEL[p]}`} checked={picked.includes(p)} onChange={() => setPicked(toggle(picked, p))} />
              {PERMISSION_LABEL[p]}
            </label>
          ))}
        </div>
      </form>
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </section>
  );
}
