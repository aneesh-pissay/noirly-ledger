import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/src/server/api/http";
import { receiptUrlFor, receiptWorkspaceId } from "@/src/server/storage/receipt-keys";
import {
  canWriteToR2,
  deleteObject,
  getObjectBuffer,
  uploadBuffer,
} from "@/src/server/storage/r2";

const ROOT = resolve(process.cwd(), "data", "receipts");
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

export { receiptUrlFor, receiptWorkspaceId };

export async function saveReceipt(input: {
  workspaceId: string;
  bytes: Buffer;
  mime: string;
}): Promise<{ key: string; url: string }> {
  if (!ALLOWED.has(input.mime)) {
    throw new ApiError(400, "invalid_request", "Receipt must be JPEG, PNG, WebP, or PDF");
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new ApiError(400, "invalid_request", "Receipt must be 8 MB or smaller");
  }

  const ext = EXT[input.mime] ?? "bin";
  const filename = `${randomUUID()}.${ext}`;

  if (canWriteToR2()) {
    const uploaded = await uploadBuffer(
      input.bytes,
      filename,
      input.mime,
      `ledger/receipts/${input.workspaceId}`,
    );
    return { key: uploaded.key, url: receiptUrlFor(uploaded.key) };
  }

  const key = `${input.workspaceId}/${filename}`;
  const path = join(ROOT, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input.bytes);
  return { key, url: receiptUrlFor(key) };
}

export async function readReceipt(key: string): Promise<{ bytes: Buffer; mime: string }> {
  if (!receiptWorkspaceId(key)) {
    throw new ApiError(404, "not_found", "Receipt not found");
  }

  try {
    const bytes = await readFile(join(ROOT, key));
    return { bytes, mime: mimeFromKey(key) };
  } catch {
    if (!canWriteToR2()) {
      throw new ApiError(404, "not_found", "Receipt not found");
    }
    try {
      const bytes = await getObjectBuffer(key);
      return { bytes, mime: mimeFromKey(key) };
    } catch {
      throw new ApiError(404, "not_found", "Receipt not found");
    }
  }
}

export async function deleteReceipt(key: string): Promise<void> {
  if (!key || key.includes("..")) return;

  if (canWriteToR2() && key.startsWith("ledger/")) {
    await deleteObject(key).catch(() => undefined);
    return;
  }

  await unlink(join(ROOT, key)).catch(() => undefined);
}
