import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";
import { E2E_BASE_URL, E2E_INBOUND_SECRET } from "./env";

type Inbound = { configured: boolean; canManage: boolean; address: { email: string; enabled: boolean; makeBills: boolean } | null; recent: Array<{ status: string; reason: string | null; receipts: number; billMade: boolean }> };
type Receipt = { name: string; date: string | null; amountMinor: number | null; currency: string | null; merchant: string | null };

/** Today moved by `days`, as YYYY-MM-DD in UTC. */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const spelled = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

function message(input: { from: string; to: string; subject: string; id: string; text: string; pdf?: string }) {
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${input.id}@mail.test>`,
    "MIME-Version: 1.0",
  ];
  if (!input.pdf) return [...lines, "Content-Type: text/plain; charset=utf-8", "", input.text, ""].join("\r\n");
  return [
    ...lines,
    'Content-Type: multipart/mixed; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.text,
    "--b1",
    `Content-Type: application/pdf; name="${input.pdf}"`,
    `Content-Disposition: attachment; filename="${input.pdf}"`,
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("%PDF-1.4\n% a receipt\n").toString("base64"),
    "--b1--",
    "",
  ].join("\r\n");
}

test.describe("emailed receipts and bills", () => {
  let owner: TestUser;
  let stranger: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ema Inbound");
    stranger = await newUser("Sam Stranger");
  });

  test.afterEach(async () => {
    await disposeAll(owner, stranger);
  });

  test("a member's forwarded receipt lands in the inbox, a bill email becomes a bill, others are dropped", async ({ browser, playwright }) => {
    const ws = await personalWorkspaceId(owner);
    const url = `/api/workspaces/${ws}/inbound-email`;
    expect(await (await owner.api.get(url)).json()).toMatchObject({ configured: true, canManage: true, address: null });
    const made = (await (await owner.api.post(url)).json()) as Inbound;
    const address = made.address!.email;
    expect(address).toMatch(/^r-[a-z0-9]{16}@in\.ledger\.e2e\.invalid$/);
    // Someone else can't see or change it.
    expect((await stranger.api.get(url)).status()).toBe(403);

    const email = async (user: TestUser) => ((await (await user.api.get("/api/me")).json()) as { user: { email: string } }).user.email;
    const relay = await playwright.request.newContext();
    const post = (raw: string, headers: Record<string, string> = { authorization: `Bearer ${E2E_INBOUND_SECRET}` }) =>
      relay.post(`${E2E_BASE_URL}/api/inbound-email?to=${encodeURIComponent(address)}`, { headers: { ...headers, "content-type": "message/rfc822" }, data: Buffer.from(raw) });
    expect((await post("x", { authorization: "Bearer wrong" })).status()).toBe(401);

    // A forwarded receipt with its PDF.
    const receipt = message({
      from: `Ema <${await email(owner)}>`,
      to: address,
      subject: "Fwd: Your Swiggy order",
      id: "r1",
      pdf: "order.pdf",
      text: `---------- Forwarded message ---------\nFrom: Swiggy <noreply@swiggy.in>\nDate: ${spelled(day(-1))}\n\nItem total Rs. 400.00\nGrand Total: Rs. 450.00`,
    });
    expect(await (await post(receipt)).json()).toEqual({ status: "accepted", receipts: 1, billMade: false });
    // The relay sending it again changes nothing.
    expect(await (await post(receipt)).json()).toMatchObject({ status: "ignored" });
    const inbox = ((await (await owner.api.get(`/api/workspaces/${ws}/receipt-inbox`)).json()) as { receipts: Receipt[] }).receipts;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ name: "order.pdf", date: day(-1), amountMinor: 45_000, currency: "INR", merchant: "Swiggy" });

    // A bill: amount due and a due date.
    const bill = message({ from: await email(owner), to: address, subject: "Fwd: Your water bill", id: "b1", text: `From: City Water <bills@water.example>\nAmount payable: Rs. 1,840.00\nDue date: ${spelled(day(10))}` });
    expect(await (await post(bill)).json()).toEqual({ status: "accepted", receipts: 0, billMade: true });
    const payments = ((await (await owner.api.get(`/api/workspaces/${ws}/payments`)).json()) as { payments: Array<{ name: string; amountMinor: number; dueDate: string }> }).payments;
    expect(payments).toEqual([expect.objectContaining({ name: "City Water", amountMinor: 184_000, dueDate: day(10) })]);

    // From someone who isn't a member, or with nothing to keep: dropped.
    expect(await (await post(message({ from: await email(stranger), to: address, subject: "Hi", id: "s1", pdf: "x.pdf", text: "Total Rs. 10" }))).json()).toMatchObject({ status: "rejected", reason: "The sender can't add expenses here" });
    expect(await (await post(message({ from: await email(owner), to: address, subject: "Just a note", id: "n1", text: "Hello" }))).json()).toMatchObject({ status: "rejected" });

    const notes = ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ kind: string; body: string }> }).notifications.filter((n) => n.kind === "email.received");
    expect(notes.map((n) => n.body)).toEqual([expect.stringContaining("A bill for City Water"), "1 receipt is in the inbox to match."]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions/receipts");
    await expect(page.getByLabel("Forwarding address")).toHaveValue(address);
    await page.getByRole("button", { name: /Recent emails/ }).click();
    await expect(page.locator('[data-email="rejected"]')).toHaveCount(2);
    await page.screenshot({ path: "test-results/inbound-email.png", fullPage: true });
    await context.close();

    // A new address retires the old one.
    expect(((await (await owner.api.post(url)).json()) as Inbound).address!.email).not.toBe(address);
    expect(await (await post(message({ from: await email(owner), to: address, subject: "late", id: "l1", pdf: "late.pdf", text: "Total Rs. 5" }))).json()).toMatchObject({ status: "ignored" });
    await relay.dispose();
  });
});
