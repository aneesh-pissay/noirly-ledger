import nodemailer from "nodemailer";

export type MailAttachment = { filename: string; content: Buffer; contentType: string };

/**
 * Sends an email through SMTP_URL; false when it isn't set or sending
 * fails. SMTP_URL=json goes through nodemailer's JSON transport: nothing
 * leaves the machine (tests and local runs use it).
 */
export async function sendLedgerEmail(input: {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<boolean> {
  const url = process.env.SMTP_URL;
  if (!url) return false;
  try {
    const transport = url === "json" ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport(url);
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "Noirly Ledger <noreply@localhost>",
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
    });
    return true;
  } catch (error) {
    console.error("ledger email failed", error);
    return false;
  }
}
