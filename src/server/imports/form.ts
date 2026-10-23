import { z } from "zod";
import { ApiError } from "@/src/server/api/http";
import { columnMappingSchema } from "@/src/core/schemas/ledger";
import type { StatementFile } from "@/src/server/imports/service";

/** The statement and options sent as a form: the file, and JSON for the column mapping and lines to skip. */
export async function readImportForm(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "invalid_request", "Choose a statement file");
  const json = (key: string) => {
    const value = form.get(key);
    if (typeof value !== "string" || !value) return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new ApiError(400, "invalid_request", `${key} isn't valid JSON`);
    }
  };
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" && value ? value : null;
  };
  const mappingJson = json("mapping");
  return {
    file: { name: file.name || "statement", bytes: Buffer.from(await file.arrayBuffer()) } satisfies StatementFile,
    mapping: mappingJson == null ? null : columnMappingSchema.parse(mappingJson),
    accountId: text("accountId"),
    categoryId: text("categoryId"),
    skipLines: z.array(z.number().int().min(1)).max(5000).parse(json("skipLines") ?? []),
  };
}
