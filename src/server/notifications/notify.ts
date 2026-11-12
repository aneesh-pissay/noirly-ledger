import { Types } from "mongoose";
import type { NotificationKind } from "@/src/core/sync/types";
import { topicOf } from "@/src/core/notification-prefs";
import { withDb } from "@/src/server/db/mongodb";
import { LedgerUser, Notification } from "@/src/server/models";
import { sendLedgerEmail } from "@/src/server/mail/send";
import { prefsFor } from "@/src/server/notification-prefs";

/**
 * Tells people something, in the app and by email, as each of them set it up
 * for the workspace's topic (src/core/notification-prefs.ts). `alsoEmail`
 * emails everyone it goes to regardless, for things they asked to get by
 * email (a digest set to email). Returns who it reached.
 */
export async function notifyUsers(input: {
  userIds: string[];
  workspaceId?: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string | null;
  alsoEmail?: boolean;
}): Promise<string[]> {
  const unique = [...new Set(input.userIds.filter(Boolean))];
  if (unique.length === 0) return [];

  return withDb(async () => {
    const topic = topicOf(input.kind);
    const prefs = await prefsFor(unique, input.workspaceId);
    const smtp = Boolean(process.env.SMTP_URL);
    const inApp = unique.filter((id) => prefs.get(id)!.channels[topic].inApp);
    const email = smtp ? unique.filter((id) => input.alsoEmail || prefs.get(id)!.channels[topic].email) : [];
    const emailSet = new Set(email);

    if (inApp.length) {
      await Notification.insertMany(
        inApp.map((userId) => ({
          userId: new Types.ObjectId(userId),
          workspaceId: input.workspaceId ? new Types.ObjectId(input.workspaceId) : null,
          kind: input.kind,
          title: input.title,
          body: input.body,
          href: input.href ?? null,
          emailRequested: emailSet.has(userId),
          createdAt: new Date(),
        })),
      );
    }

    if (email.length) {
      const users = await LedgerUser.find({ _id: { $in: email.map((id) => new Types.ObjectId(id)) } }).lean();
      await Promise.all(
        users.map((user) =>
          user.email
            ? sendLedgerEmail({ to: user.email, subject: input.title, text: `${input.body}\n${input.href ?? ""}`.trim() })
            : Promise.resolve(false),
        ),
      );
    }
    return [...new Set([...inApp, ...email])];
  });
}
