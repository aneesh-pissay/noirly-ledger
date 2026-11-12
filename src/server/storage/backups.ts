import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { canWriteToR2, deleteObject, getObjectBuffer, uploadBuffer } from "@/src/server/storage/r2";

/**
 * Where backups are kept: R2 when it's set up (under ledger/backups/), else
 * data/backups on this server's disk. Backups are sealed before they get
 * here (src/server/backups.ts), so the store never holds them readable.
 */
const ROOT = resolve(process.cwd(), "data", "backups");

export type StoredObject = { storage: "r2" | "local"; key: string };

export async function putBackup(workspaceId: string, body: Buffer): Promise<StoredObject> {
  const filename = `${randomUUID()}.bak`;
  if (canWriteToR2()) {
    const uploaded = await uploadBuffer(body, filename, "application/octet-stream", `ledger/backups/${workspaceId}`);
    return { storage: "r2", key: uploaded.key };
  }
  const key = `${workspaceId}/${filename}`;
  const path = join(ROOT, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return { storage: "local", key };
}

function localPath(key: string) {
  if (key.includes("..") || !/^[a-f0-9]{24}\/[a-f0-9-]+\.bak$/.test(key)) throw new Error("Not a backup key");
  return join(ROOT, key);
}

export async function readBackupObject(object: StoredObject): Promise<Buffer> {
  return object.storage === "r2" ? getObjectBuffer(object.key) : readFile(localPath(object.key));
}

export async function removeBackupObject(object: StoredObject) {
  if (object.storage === "r2") await deleteObject(object.key).catch(() => undefined);
  else await unlink(localPath(object.key)).catch(() => undefined);
}
