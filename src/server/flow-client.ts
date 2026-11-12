/**
 * A small client for Noirly Flow's API (docs/API.md in noirly-flow), as one
 * person with their access token. Flow's address comes from NOIRLY_FLOW_URL,
 * never from what someone types, so Ledger only ever calls that one server.
 */

export class FlowError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function flowUrl(): string | null {
  const url = process.env.NOIRLY_FLOW_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

export type FlowWorkspace = { id: string; name: string; kind: string };
export type FlowProject = { id: string; name: string; archivedAt?: string | null };
export type FlowTaskView = { id: string; status: string };

export function flowClient(token: string, fetcher: typeof fetch = fetch) {
  const base = flowUrl();
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!base) throw new FlowError(503, "not_configured", "Noirly Flow isn't set up on this server");
    let res: Response;
    try {
      res = await fetcher(`${base}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } catch {
      throw new FlowError(502, "unreachable", "Couldn't reach Noirly Flow");
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      const message =
        res.status === 401 ? "Flow didn't accept the token; it may have expired or been revoked" :
        data.error === "read_only_token" ? "That's a read-only token; make a read and write one" :
        data.message ?? `Flow answered ${res.status}`;
      throw new FlowError(res.status, data.error ?? "flow_error", message);
    }
    return data as T;
  }
  return {
    workspaces: () => call<{ workspaces: FlowWorkspace[] }>("GET", "/api/workspaces").then((r) => r.workspaces),
    projects: (workspaceId: string) => call<{ projects: FlowProject[] }>("GET", `/api/workspaces/${encodeURIComponent(workspaceId)}/projects`).then((r) => r.projects),
    createTask: (workspaceId: string, body: Record<string, unknown>) => call<{ task: FlowTaskView }>("POST", `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks`, body).then((r) => r.task),
    updateTask: (taskId: string, patch: Record<string, unknown>) => call<{ task: FlowTaskView }>("PATCH", `/api/tasks/${encodeURIComponent(taskId)}`, patch).then((r) => r.task),
  };
}
