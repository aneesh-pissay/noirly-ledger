"use client";

import {
  useChannel,
  useRealtimeClient,
  useRealtimeEvent,
} from "@noirly-dev/realtime-client/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { shouldApplyLww } from "@noirly-dev/realtime-shared";
import { qk } from "@/src/core/sync/query-keys";
import type { BudgetPool } from "@/src/core/sync/types";
import { setLedgerRealtimeScope } from "@/src/features/realtime/LedgerRealtimeProvider";

type Payload = {
  pool?: BudgetPool;
  poolId?: string;
  version: number;
};

function patchPool(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  pool: BudgetPool,
) {
  queryClient.setQueryData(
    qk.budgetPool(pool.id),
    (old: { pool: BudgetPool } | undefined) => {
      const current = old?.pool;
      if (
        current &&
        !shouldApplyLww(
          { version: Date.parse(pool.updatedAt) },
          { version: Date.parse(current.updatedAt) },
        )
      ) {
        return old;
      }
      return { pool };
    },
  );
  queryClient.setQueryData(
    qk.budgetPools(workspaceId),
    (old: { pools: BudgetPool[] } | undefined) => {
      if (!old) return old;
      const idx = old.pools.findIndex((item) => item.id === pool.id);
      if (idx === -1) return { pools: [...old.pools, pool] };
      const current = old.pools[idx]!;
      if (
        !shouldApplyLww(
          { version: Date.parse(pool.updatedAt) },
          { version: Date.parse(current.updatedAt) },
        )
      ) {
        return old;
      }
      const next = old.pools.slice();
      next[idx] = pool;
      return { pools: next };
    },
  );
}

function WorkspaceRealtimeConnected({ workspaceId }: { workspaceId: string }) {
  const client = useRealtimeClient();
  const queryClient = useQueryClient();
  const channel = `workspace:${workspaceId}:approvals`;

  useEffect(() => {
    setLedgerRealtimeScope(workspaceId);
    void client.connect().catch(() => undefined);
  }, [client, workspaceId]);

  useChannel(channel);

  useRealtimeEvent<Payload>(channel, "expense.submitted", () => {
    void queryClient.invalidateQueries({ queryKey: qk.approvals(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  });
  useRealtimeEvent<Payload>(channel, "expense.approved", (data) => {
    if (data.pool) patchPool(queryClient, workspaceId, data.pool);
    void queryClient.invalidateQueries({ queryKey: qk.approvals(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  });
  // One step of several approved: it moves on to the next approvers.
  useRealtimeEvent<Payload>(channel, "expense.advanced", () => {
    void queryClient.invalidateQueries({ queryKey: qk.approvals(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  });
  useRealtimeEvent<Payload>(channel, "expense.rejected", () => {
    void queryClient.invalidateQueries({ queryKey: qk.approvals(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  });

  return null;
}

export function WorkspaceRealtime({ workspaceId }: { workspaceId: string }) {
  if (!process.env.NEXT_PUBLIC_REALTIME_WS_URL) return null;
  return <WorkspaceRealtimeConnected workspaceId={workspaceId} />;
}
