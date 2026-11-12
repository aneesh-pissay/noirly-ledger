import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { InboundAddress, InboundEmail, LedgerUser, ReceiptInbox, ScheduledPayment, Workspace } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { saveReceipt } from "@/src/server/storage/receipts";
import { createPayment } from "@/src/server/payments";
import { notifyUsers } from "@/src/server/notifications/notify";
import { formatMoney } from "@/src/core/locale-format";
import { guessFromFileName } from "@/src/core/receipts";
import { binaryString, parseMail } from "@/src/core/mime";
import { addressedLocalPart, billName, guessBill, guessFromEmail, isAddressLocalPart, receiptFiles, type InboundView } from "@/src/core/inbound-email";

/** Raw messages bigger than this are turned away before reading. */
export const MAX_EMAIL_BYTES = 25 * 1024 * 1024;

export function inboundDomain(): string | null {
  return process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase() || null;
}

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** 16 letters and digits: about 82 bits, not something to guess. */
function newLocalPart() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(16);
  return `r-${[...bytes].map((b) => alphabet[b % alphabet.length]).join("")}`;
}



/** The workspace's forwarding address and the last emails it got. Anyone who can add expenses sees it. */
export function getInbound(userId: string, workspaceId: string): Promise<InboundView> {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    const ws = oid(workspaceId);
    const domain = inboundDomain();
    const [doc, recent] = await Promise.all([
      InboundAddress.findOne({ workspaceId: ws }).lean(),
      InboundEmail.find({ workspaceId: ws }).sort({ receivedAt: -1 }).limit(20).lean(),
    ]);
    return {
      configured: Boolean(domain),
      canManage: await canManage(userId, workspaceId),
      address: doc && domain ? { email: `${doc.localPart}@${domain}`, enabled: doc.enabled, makeBills: doc.makeBills, createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? "" } : null,
      recent: recent.map((e) => ({ id: String(e._id), from: e.from ?? null, subject: e.subject ?? null, status: e.status, reason: e.reason ?? null, receipts: e.receipts, billMade: Boolean(e.paymentId), receivedAt: e.receivedAt.toISOString() })),
    };
  });
}

/** A personal workspace is its owner's to set up; a team's, its managers'. */
async function canManage(userId: string, workspaceId: string) {
  const workspace = await Workspace.findById(oid(workspaceId)).select("kind").lean();
  if (workspace?.kind === "personal") return true;
  try {
    await requireAction(userId, workspaceId, "integrations.manage");
    return true;
  } catch {
    return false;
  }
}

async function requireManage(userId: string, workspaceId: string) {
  await requireMembershipRole(userId, workspaceId);
  if (!(await canManage(userId, workspaceId))) throw new ApiError(403, "forbidden", "Only those who manage integrations can change the workspace's email address");
}

/** Makes the address, or a new one in its place (the old one stops working). */
export function rotateInboundAddress(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireManage(userId, workspaceId);
    if (!inboundDomain()) throw new ApiError(400, "invalid_request", "Inbound email isn't set up on this server");
    await InboundAddress.updateOne(
      { workspaceId: oid(workspaceId) },
      { $set: { localPart: newLocalPart(), enabled: true }, $setOnInsert: { createdById: oid(userId), makeBills: true } },
      { upsert: true },
    );
  });
}

export function setInboundOptions(userId: string, workspaceId: string, input: { enabled: boolean; makeBills: boolean }) {
  return withDb(async () => {
    await requireManage(userId, workspaceId);
    const res = await InboundAddress.updateOne({ workspaceId: oid(workspaceId) }, { $set: { enabled: input.enabled, makeBills: input.makeBills } });
    if (!res.matchedCount) throw new ApiError(404, "not_found", "No email address yet");
  });
}

export function deleteInboundAddress(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireManage(userId, workspaceId);
    await InboundAddress.deleteOne({ workspaceId: oid(workspaceId) });
  });
}

export type ReceiveResult = { status: "accepted" | "rejected" | "ignored"; reason?: string; receipts?: number; billMade?: boolean };

/**
 * One raw email from the relay. `to` is the envelope recipient when the
 * relay knows it; otherwise the message's own recipient headers are read.
 * Only mail from a member who can add expenses is taken; the rest is
 * logged and dropped, with no reply (so spoofed mail can't bounce at
 * someone).
 */
export function receiveEmail(raw: Uint8Array, to: string | null, now = new Date()): Promise<ReceiveResult> {
  return withDb(async () => {
    const domain = inboundDomain();
    if (!domain) return { status: "ignored", reason: "Inbound email isn't set up" };
    const mail = parseMail(binaryString(raw));
    const local = addressedLocalPart([...(to ? [to.trim().toLowerCase()] : []), ...mail.recipients], domain);
    // Unknown addresses aren't logged against anyone.
    if (!local || !isAddressLocalPart(local)) return { status: "ignored", reason: "Not one of our addresses" };
    const address = await InboundAddress.findOne({ localPart: local }).lean();
    if (!address) return { status: "ignored", reason: "Not one of our addresses" };
    const workspaceId = String(address.workspaceId);
    const log = (status: "accepted" | "rejected", extra: Record<string, unknown> = {}) =>
      InboundEmail.create({ workspaceId: address.workspaceId, from: mail.from?.address ?? null, subject: mail.subject.slice(0, 200) || null, messageId: mail.messageId, status, receivedAt: now, ...extra });
    const reject = async (reason: string): Promise<ReceiveResult> => {
      await log("rejected", { reason });
      return { status: "rejected", reason };
    };

    if (!address.enabled) return reject("The address is turned off");
    if (mail.messageId && (await InboundEmail.exists({ workspaceId: address.workspaceId, messageId: mail.messageId, status: "accepted" }))) {
      return { status: "ignored", reason: "Already received" };
    }
    // From a member who can add expenses here.
    const sender = mail.from ? await LedgerUser.findOne({ email: mail.from.address }).select("_id").lean() : null;
    if (!sender) return reject("Not from a member's email address");
    const senderId = String(sender._id);
    try {
      await requireAction(senderId, workspaceId, "expense.submit");
    } catch {
      return reject("The sender can't add expenses here");
    }

    const workspace = await Workspace.findById(address.workspaceId).select("baseCurrency kind").lean();
    const files = receiptFiles(mail.attachments);
    const emailGuess = guessFromEmail(mail, true);
    const bill = address.makeBills ? guessBill(mail) : null;
    if (!files.length && !bill) return reject("No receipt files (PDF, JPEG, PNG or WebP) and no bill found");

    // One receipt in an email is what the email is about; with several, each file's own name says more.
    for (const file of files) {
      const fromName = guessFromFileName(file.name);
      const saved = await saveReceipt({ workspaceId, bytes: Buffer.from(file.bytes), mime: file.contentType });
      await ReceiptInbox.create({
        workspaceId: address.workspaceId,
        storageKey: saved.key,
        name: file.name.slice(0, 200) || "Emailed receipt",
        contentType: file.contentType,
        size: file.bytes.byteLength,
        date: fromName.date ?? (files.length === 1 ? emailGuess.date : null) ?? mail.date,
        amountMinor: fromName.amountMinor ?? (files.length === 1 ? emailGuess.amountMinor : null),
        currency: files.length === 1 ? emailGuess.currency : null,
        merchant: fromName.merchant ?? emailGuess.merchant,
        uploadedById: sender._id,
      });
    }

    let paymentId: string | null = null;
    let billLine = "";
    if (bill) {
      const name = billName(mail, true);
      const currency = bill.currency ?? workspace?.baseCurrency ?? "INR";
      // The same bill emailed twice (or a reminder about it) isn't added again.
      const existing = await ScheduledPayment.findOne({ workspaceId: address.workspaceId, dueDate: bill.dueDate, amountMinor: bill.amountMinor, paidOn: null }).select("_id").lean();
      if (!existing) {
        const payment = await createPayment(senderId, workspaceId, { name, amountMinor: bill.amountMinor, currency, dueDate: bill.dueDate, accountId: null, categoryId: null, note: mail.subject ? `Emailed: ${mail.subject}`.slice(0, 200) : "Emailed bill", repeat: "none" });
        paymentId = payment.id;
        billLine = ` A bill for ${name}, ${formatMoney(bill.amountMinor, currency)} due ${bill.dueDate}, was added.`;
      }
    }
    try {
      await log("accepted", { receipts: files.length, paymentId: paymentId ? oid(paymentId) : null, senderId: sender._id });
    } catch (error) {
      // Two deliveries of one message at once: the other one logged it.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const receiptsLine = files.length ? `${files.length} receipt${files.length === 1 ? " is" : "s are"} in the inbox to match.` : "";
    await notifyUsers({
      userIds: [senderId],
      workspaceId,
      kind: "email.received",
      title: `Got your email${mail.subject ? `: ${mail.subject.slice(0, 60)}` : ""}`,
      body: `${receiptsLine}${billLine}`.trim(),
      href: workspace?.kind === "team" ? `/w/${workspaceId}/transactions/receipts` : "/transactions/receipts",
    });
    return { status: "accepted", receipts: files.length, billMade: Boolean(paymentId) };
  });
}
