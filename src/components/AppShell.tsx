"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  BarChart3,
  FolderKanban,
  Goal,
  LayoutDashboard,
  Plus,
  Receipt,
  Repeat,
  Settings,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import {
  Avatar,
  AppShell as UIShell,
  SidebarBrand,
  cn,
  type AppNavGroup,
  type AppNavItem,
  type Crumb,
} from "@noirly-dev/ui";
import { SignOutButton } from "@/src/features/auth/SignOutButton";
import { CreateTeamWorkspace } from "@/src/features/workspace/CreateTeamWorkspace";
import { CommandPalette } from "@/src/features/command-palette/CommandPalette";
import { TransactionComposer } from "@/src/features/transactions/TransactionComposer";
import { NotificationBell } from "@/src/features/notifications/NotificationBell";
import { ThemeControls } from "@/src/components/ThemeControls";
import { useUIStore, useWorkspaceStore } from "@/src/stores/ui-store";
import type { WorkspaceWithRole } from "@/src/core/sync/types";
import { can } from "@/src/core/permissions/can";

export type ShellUser = {
  displayName: string;
  email: string;
};

type Props = {
  user: ShellUser;
  workspaces: WorkspaceWithRole[];
  children: ReactNode;
};

const openCommandPalette = () => useUIStore.getState().setCommandPaletteOpen(true);

/** Workspace rows reuse the sidebar nav treatment so the rail reads as one list. */
function workspaceLinkClass(active: boolean) {
  return cn("nav-item focusable justify-between", active && "text-[var(--accent)]");
}

export function AppShell({ user, workspaces, children }: Props) {
  const pathname = usePathname();
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);

  const personal = workspaces.find((w) => w.kind === "personal");
  const teams = workspaces.filter((w) => w.kind === "team");

  const activeWorkspaceId = pathname.startsWith("/w/")
    ? (pathname.split("/")[2] ?? null)
    : (personal?.id ?? null);

  const isPersonalRoute =
    !pathname.startsWith("/w/") &&
    !pathname.startsWith("/settings") &&
    pathname !== "/login";

  const teamRole = teams.find((w) => w.id === activeWorkspaceId)?.role ?? "member";

  useEffect(() => {
    if (activeWorkspaceId) {
      setActiveWorkspaceId(activeWorkspaceId);
    }
  }, [activeWorkspaceId, setActiveWorkspaceId]);

  /**
   * Grouped rather than one flat list of eight. The labels are the point: a
   * reader scanning the rail is looking for a category first, and "Money" vs
   * "Planning" narrows eight destinations to three or four before they read a
   * single item.
   */
  const groups: AppNavGroup[] = useMemo(() => {
    if (pathname.startsWith("/w/") && activeWorkspaceId) {
      const base = `/w/${activeWorkspaceId}`;
      const money: AppNavItem[] = [
        { href: `${base}/pools`, label: "Budget pools", icon: FolderKanban },
        { href: `${base}/expenses`, label: "Expenses", icon: Receipt },
      ];
      if (can(teamRole, "expense.decide")) {
        money.push({ href: `${base}/approvals`, label: "Approvals", icon: Wallet });
      }

      return [
        { items: [{ href: base, label: "Dashboard", icon: LayoutDashboard, match: "exact" }] },
        { label: "Money", items: money },
        {
          label: "Workspace",
          items: [
            { href: `${base}/members`, label: "Members", icon: Users },
            { href: `${base}/reports`, label: "Reports", icon: BarChart3 },
            { href: "/settings", label: "Settings", icon: Settings },
          ],
        },
      ];
    }

    return [
      { items: [{ href: "/home", label: "Dashboard", icon: LayoutDashboard, match: "exact" }] },
      {
        label: "Money",
        items: [
          { href: "/transactions", label: "Transactions", icon: Receipt },
          { href: "/budgets", label: "Budgets", icon: Wallet },
          { href: "/recurring", label: "Recurring", icon: Repeat },
        ],
      },
      {
        label: "Planning",
        items: [
          { href: "/goals", label: "Goals", icon: Goal },
          { href: "/categories", label: "Categories", icon: Tags },
          { href: "/reports", label: "Reports", icon: BarChart3 },
        ],
      },
      { label: "Workspace", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
    ];
  }, [activeWorkspaceId, pathname, teamRole]);

  /**
   * Breadcrumb from the nav definition rather than from the URL, so a segment
   * renders as "Budget pools" instead of "pools" and an id segment does not
   * leak a mongo ObjectId into the header.
   */
  const breadcrumb: Crumb[] = useMemo(() => {
    const team = pathname.startsWith("/w/") ? teams.find((w) => w.id === activeWorkspaceId) : undefined;
    const workspaceName = team?.name ?? personal?.name ?? "Ledger";
    // The workspace crumb leads to that workspace's dashboard, not always Personal.
    const workspaceHref = team ? `/w/${team.id}` : personal ? "/home" : "/";
    const flat = groups.flatMap((g) => g.items);
    const match = flat
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      // Longest href wins, so /w/:id/pools beats the /w/:id dashboard entry.
      .sort((a, b) => b.href.length - a.href.length)[0];

    const trail: Crumb[] = [{ label: workspaceName, href: workspaceHref }];
    if (match) trail.push({ label: match.label, href: match.href });
    return trail;
  }, [groups, pathname, teams, personal, activeWorkspaceId]);

  return (
    <>
      <UIShell
        sidebar={{
          brand: (
            <SidebarBrand
              logo={<span className="font-mono text-[0.625rem] font-bold tracking-[0.04em]">NL</span>}
              title="Noirly"
              subtitle="Ledger"
            />
          ),
          children: (
            <div className="flex flex-col gap-1">
              <p className="nav-group-label pt-1">Workspace</p>
              {personal ? (
                <Link
                  href="/home"
                  aria-current={
                    isPersonalRoute || pathname === "/home" ? "page" : undefined
                  }
                  className={workspaceLinkClass(isPersonalRoute || pathname === "/home")}
                >
                  <span className="truncate">{personal.name}</span>
                  <span className="meta shrink-0 text-[0.5625rem]">personal</span>
                </Link>
              ) : null}
              {teams.map((workspace) => {
                const active =
                  activeWorkspaceId === workspace.id && pathname.startsWith("/w/");
                return (
                  <Link
                    key={workspace.id}
                    href={`/w/${workspace.id}`}
                    aria-current={active ? "page" : undefined}
                    className={workspaceLinkClass(active)}
                  >
                    <span className="truncate">{workspace.name}</span>
                    <span className="meta shrink-0 text-[0.5625rem]">team</span>
                  </Link>
                );
              })}
              <CreateTeamWorkspace />
            </div>
          ),
          groups,
          footer: (
            <div className="flex items-center gap-2.5">
              <Avatar name={user.displayName} />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <p className="truncate text-[0.8125rem] font-medium">{user.displayName}</p>
                <p className="meta truncate text-[0.625rem]">{user.email}</p>
              </div>
              <SignOutButton />
            </div>
          ),
        }}
        header={{
          breadcrumb,
          brand: <p className="font-display text-sm font-semibold tracking-tight">Ledger</p>,
          onCommandClick: openCommandPalette,
          actions: (
            <>
              <button
                type="button"
                onClick={openCommandPalette}
                aria-label="Quick add"
                className="focusable inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:hidden"
              >
                <Plus size={16} />
              </button>
              <ThemeControls size="sm" />
              <NotificationBell />
              <Avatar name={user.displayName} />
            </>
          ),
        }}
      >
        {children}
      </UIShell>
      <CommandPalette workspaces={workspaces} />
      {personal ? (
        <TransactionComposer
          workspaceId={personal.id}
          baseCurrency={personal.baseCurrency}
        />
      ) : null}
    </>
  );
}
