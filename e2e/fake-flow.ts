import { createServer, type Server } from "node:http";
import { FAKE_FLOW_PORT } from "./env";

export type FakeTask = { id: string; workspaceId: string; projectId: string | null; title: string; description: string; status: string; priority: string; dueAt: string };

/**
 * Just enough of Noirly Flow's API for Ledger's Flow sync: one read and
 * write token, one read-only token, a workspace with a project, and tasks.
 */
export const FLOW_TOKEN = "nfp_w_e2e_token_1234";
export const FLOW_READ_ONLY = "nfp_r_e2e_token_5678";
export const FLOW_WORKSPACE = { id: "a".repeat(24), name: "Home tasks", kind: "personal" };
export const FLOW_PROJECT = { id: "b".repeat(24), name: "Bills" };

export function startFakeFlow(): Promise<{ tasks: FakeTask[]; close: () => Promise<void> }> {
  const tasks: FakeTask[] = [];
  let next = 1;
  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${FLOW_TOKEN}` && auth !== `Bearer ${FLOW_READ_ONLY}`) return send(401, { error: "unauthorized", message: "Sign in" });
    if (auth === `Bearer ${FLOW_READ_ONLY}` && req.method !== "GET") return send(403, { error: "read_only_token", message: "Read only" });
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const url = req.url ?? "";
      if (req.method === "GET" && url === "/api/workspaces") return send(200, { workspaces: [FLOW_WORKSPACE] });
      if (req.method === "GET" && url === `/api/workspaces/${FLOW_WORKSPACE.id}/projects`) return send(200, { projects: [FLOW_PROJECT] });
      if (req.method === "POST" && url === `/api/workspaces/${FLOW_WORKSPACE.id}/tasks`) {
        const task: FakeTask = { id: String(next++).padStart(24, "c"), workspaceId: FLOW_WORKSPACE.id, projectId: (body.projectId as string | null) ?? null, title: String(body.title), description: String(body.description ?? ""), status: "todo", priority: String(body.priority ?? "none"), dueAt: String(body.dueAt) };
        tasks.push(task);
        return send(201, { task });
      }
      const patch = /^\/api\/tasks\/([a-z0-9]+)$/.exec(url);
      if (req.method === "PATCH" && patch) {
        const task = tasks.find((t) => t.id === patch[1]);
        if (!task) return send(404, { error: "not_found", message: "Task not found" });
        Object.assign(task, body);
        return send(200, { task });
      }
      send(404, { error: "not_found", message: "Not found" });
    });
  });
  return new Promise((resolve) => {
    server.listen(FAKE_FLOW_PORT, "127.0.0.1", () =>
      resolve({ tasks, close: () => new Promise<void>((done) => server.close(() => done())) }),
    );
  });
}
