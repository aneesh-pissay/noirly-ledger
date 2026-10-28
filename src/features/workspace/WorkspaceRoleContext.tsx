"use client";

import { createContext, useContext, type ReactNode } from "react";
import { can, type Grant, type PermissionAction } from "@/src/core/permissions/can";

/** What the person may do in the workspace being viewed: their role, or their custom role's permissions. */
const WorkspaceRoleContext = createContext<Grant>("member");

export function WorkspaceRoleProvider({
  grant,
  children,
}: {
  grant: Grant;
  children: ReactNode;
}) {
  return (
    <WorkspaceRoleContext.Provider value={grant}>
      {children}
    </WorkspaceRoleContext.Provider>
  );
}

export function useWorkspaceRole(): Grant {
  return useContext(WorkspaceRoleContext);
}

export function useCan(action: PermissionAction): boolean {
  return can(useWorkspaceRole(), action);
}
