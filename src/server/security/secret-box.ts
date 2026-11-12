import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Seals secrets Ledger keeps for people (another app's access token) with
 * AES-256-GCM. The key is LEDGER_SECRET_KEY, or else derived from
 * AUTH_SECRET, so changing either makes sealed secrets unreadable.
 */
function key() {
  const source = process.env.LEDGER_SECRET_KEY || process.env.AUTH_SECRET;
  if (!source || source.length < 32) throw new Error("Set LEDGER_SECRET_KEY (or AUTH_SECRET) to at least 32 characters");
  return createHash("sha256").update(`ledger-secret-box:${source}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Not a sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
