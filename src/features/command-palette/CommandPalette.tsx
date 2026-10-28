"use client";

import { Command } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUIStore } from "@/src/stores/ui-store";
import type { WorkspaceWithRole } from "@/src/core/sync/types";
import { can } from "@/src/core/permissions/can";

type Props = { workspaces: WorkspaceWithRole[] };

export function CommandPalette({ workspaces }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const toggle = useUIStore((s) => s.toggleCommandPalette);
  const setComposer = useUIStore((s) => s.setTransactionComposerOpen);
  const personal = workspaces.find((w) => w.kind === "personal");
  const teamId = pathname.startsWith("/w/") ? pathname.split("/")[2] : null;
  const team = workspaces.find((w) => w.id === teamId);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
        return;
      }
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (!inField && event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        if (teamId) {
          router.push(`/w/${teamId}/expenses/new`);
          return;
        }
        setComposer(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, setComposer, teamId, toggle]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
      />
      <div className="relative mx-auto mt-24 w-full max-w-lg px-4">
        <Command className="overflow-hidden surface grain rounded-[var(--r-lg)] shadow-xl">
          <Command.Input
            autoFocus
            placeholder="Search or jump…"
            className="w-full border-b border-[var(--hairline)] bg-transparent px-4 py-3 text-sm outline-none"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-sm text-[var(--muted-foreground)]">
              No results
            </Command.Empty>
            <Command.Group heading="Actions">
              {teamId ? (
                <Command.Item
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-[var(--surface-2)]"
                  onSelect={() => go(`/w/${teamId}/expenses/new`)}
                >
                  Submit expense
                </Command.Item>
              ) : (
                <Command.Item
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-[var(--surface-2)]"
                  onSelect={() => {
                    setOpen(false);
                    setComposer(true);
                  }}
                >
                  Add transaction
                </Command.Item>
              )}
              <Command.Item
                className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-[var(--surface-2)]"
                onSelect={() =>
                  go(teamId ? `/w/${teamId}/reports` : "/reports")
                }
              >
                Export report
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Navigate">
              {(teamId
                ? [
                    { href: `/w/${teamId}`, label: "Dashboard" },
                    { href: `/w/${teamId}/pools`, label: "Budget pools" },
                    { href: `/w/${teamId}/expenses`, label: "Expenses" },
                    ...(team && can(team.grant, "expense.decide")
                      ? [{ href: `/w/${teamId}/approvals`, label: "Approvals" }]
                      : []),
                    { href: `/w/${teamId}/members`, label: "Members" },
                    { href: `/w/${teamId}/reports`, label: "Reports" },
                    { href: "/settings/currency", label: "Currency" },
                  ]
                : [
                    { href: "/home", label: "Dashboard" },
                    { href: "/transactions", label: "Transactions" },
                    { href: "/budgets", label: "Budgets" },
                    { href: "/categories", label: "Categories" },
                    { href: "/goals", label: "Goals" },
                    { href: "/recurring", label: "Recurring" },
                    { href: "/reports", label: "Reports" },
                    { href: "/settings/currency", label: "Currency" },
                  ]
              ).map((item) => (
                <Command.Item
                  key={item.href}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-[var(--surface-2)]"
                  onSelect={() => go(item.href)}
                >
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Workspaces">
              {personal ? (
                <Command.Item
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-[var(--surface-2)]"
                  onSelect={() => go("/home")}
                >
                  Personal
                </Command.Item>
              ) : null}
              {workspaces
                .filter((w) => w.kind === "team")
                .map((workspace) => (
                  <Command.Item
                    key={workspace.id}
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-[var(--surface-2)]"
                    onSelect={() => go(`/w/${workspace.id}`)}
                  >
                    {workspace.name}
                  </Command.Item>
                ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
