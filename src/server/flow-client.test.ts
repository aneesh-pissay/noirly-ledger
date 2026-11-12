import { afterEach, describe, expect, it } from "vitest";
import { FlowError, flowClient } from "./flow-client";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Flow client", () => {
  const before = process.env.NOIRLY_FLOW_URL;
  afterEach(() => {
    process.env.NOIRLY_FLOW_URL = before;
  });

  it("calls the configured Flow with the token, and unwraps answers", async () => {
    process.env.NOIRLY_FLOW_URL = "https://flow.example/";
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return init.method === "POST" ? reply(201, { task: { id: "t1", status: "todo" } }) : reply(200, { workspaces: [{ id: "w1", name: "Home", kind: "personal" }] });
    }) as unknown as typeof fetch;
    const flow = flowClient("nfp_w_abc", fetcher);
    expect(await flow.workspaces()).toEqual([{ id: "w1", name: "Home", kind: "personal" }]);
    expect(await flow.createTask("w1", { title: "Pay rent" })).toEqual({ id: "t1", status: "todo" });
    expect(calls[0]!.url).toBe("https://flow.example/api/workspaces");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer nfp_w_abc");
    expect(calls[1]!.url).toBe("https://flow.example/api/workspaces/w1/tasks");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ title: "Pay rent" });
  });

  it("says plainly what went wrong", async () => {
    process.env.NOIRLY_FLOW_URL = "https://flow.example";
    const failing = (status: number, body: unknown) => flowClient("t", (async () => reply(status, body)) as unknown as typeof fetch);
    await expect(failing(401, { error: "unauthorized" }).workspaces()).rejects.toThrow(/expired or been revoked/);
    await expect(failing(403, { error: "read_only_token" }).createTask("w", {})).rejects.toThrow(/read-only token/);
    await expect(failing(404, { error: "not_found", message: "Task not found" }).updateTask("x", {})).rejects.toMatchObject({ status: 404 });
    const down = flowClient("t", (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    await expect(down.workspaces()).rejects.toThrow(/Couldn't reach/);
    delete process.env.NOIRLY_FLOW_URL;
    await expect(flowClient("t").workspaces()).rejects.toBeInstanceOf(FlowError);
  });
});
