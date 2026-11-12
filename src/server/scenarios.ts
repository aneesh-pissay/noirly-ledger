import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Scenario as ScenarioModel } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import type { ScenarioChange } from "@/src/core/forecast";
import type { SavedScenario } from "@/src/core/sync/types";

const MAX_SCENARIOS = 30;

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function map(doc: { _id: Types.ObjectId; name: string; changes: unknown[]; updatedAt: Date }): SavedScenario {
  return { id: String(doc._id), name: doc.name, changes: doc.changes as ScenarioChange[], updatedAt: doc.updatedAt.toISOString() };
}

/** Saved what-ifs, newest first. Planning changes nothing real, so anyone in the workspace can keep them. */
export function listScenarios(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await ScenarioModel.find({ workspaceId: oid(workspaceId) }).sort({ updatedAt: -1 }).lean();
    return docs.map((doc) => map(doc as Parameters<typeof map>[0]));
  });
}

export function createScenario(userId: string, workspaceId: string, input: { name: string; changes: ScenarioChange[] }) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    if ((await ScenarioModel.countDocuments({ workspaceId: oid(workspaceId) })) >= MAX_SCENARIOS) {
      throw new ApiError(400, "limit_reached", `A workspace can keep up to ${MAX_SCENARIOS} scenarios.`);
    }
    const doc = await ScenarioModel.create({ workspaceId: oid(workspaceId), name: input.name.trim(), changes: input.changes, createdById: oid(userId) });
    return map(doc.toObject() as Parameters<typeof map>[0]);
  });
}

async function requireScenario(userId: string, scenarioId: string) {
  const doc = await ScenarioModel.findById(oid(scenarioId));
  if (!doc) throw new ApiError(404, "not_found", "Scenario not found");
  await requireMembershipRole(userId, String(doc.workspaceId));
  return doc;
}

export function updateScenario(userId: string, scenarioId: string, patch: { name?: string; changes?: ScenarioChange[] }) {
  return withDb(async () => {
    const doc = await requireScenario(userId, scenarioId);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.changes !== undefined) doc.set("changes", patch.changes);
    await doc.save();
    return map(doc.toObject() as Parameters<typeof map>[0]);
  });
}

export function deleteScenario(userId: string, scenarioId: string) {
  return withDb(async () => {
    const doc = await requireScenario(userId, scenarioId);
    await doc.deleteOne();
  });
}
