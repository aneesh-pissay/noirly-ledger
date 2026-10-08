// Merges duplicate personal workspaces into each user's oldest one.
//
// A first-login race could create two personal workspaces for one user. This
// moves everything from the newer duplicates into the oldest, then deletes
// the duplicates, so the unique index `one_personal_workspace_per_owner` can
// build.
//
//   node --env-file=.env.local scripts/merge-duplicate-personal-workspaces.mjs          # report only
//   node --env-file=.env.local scripts/merge-duplicate-personal-workspaces.mjs --apply  # make the changes
//
// System categories in a duplicate are matched to the keeper's category of the
// same name; everything that pointed at them is re-pointed. Where the keeper
// already has the same budget (category + period + start) or FX rate
// (currency + day), the keeper's row wins and the duplicate's row is dropped.
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
const col = (name) => db.collection(name);

const groups = await col("workspaces")
  .aggregate([
    { $match: { kind: "personal" } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: "$ownerUserId", ids: { $push: "$_id" }, currencies: { $push: "$baseCurrency" } } },
    { $match: { "ids.1": { $exists: true } } },
  ])
  .toArray();

if (groups.length === 0) {
  console.log("No duplicate personal workspaces.");
}

for (const group of groups) {
  const [keeperId, ...duplicateIds] = group.ids;
  console.log(`\nOwner ${group._id}: keep ${keeperId}, merge ${duplicateIds.join(", ")}`);
  if (new Set(group.currencies).size > 1) {
    console.log(`  SKIPPED: base currencies differ (${group.currencies.join(", ")}); stored base amounts would be wrong.`);
    continue;
  }

  const keeperCategories = await col("categories").find({ workspaceId: keeperId, isSystem: true }).toArray();
  const keeperSystemByName = new Map(keeperCategories.map((c) => [c.name, c._id]));

  for (const dupId of duplicateIds) {
    const counts = {};
    for (const name of ["transactions", "categories", "budgets", "budget_pools", "savings_goals", "fx_rates", "approval_requests", "workspace_invites", "notifications"]) {
      counts[name] = await col(name).countDocuments({ workspaceId: dupId });
    }
    console.log(`  ${dupId} holds`, counts);

    // Category id remap: duplicate system category → keeper's system category of the same name.
    const remap = new Map();
    const dupCategories = await col("categories").find({ workspaceId: dupId }).toArray();
    for (const category of dupCategories) {
      const target = category.isSystem ? keeperSystemByName.get(category.name) : undefined;
      if (target) remap.set(String(category._id), target);
    }
    console.log(`  ${remap.size} system categories map onto the keeper's; ${dupCategories.length - remap.size} categories move as-is`);
    if (!apply) continue;

    for (const [from, to] of remap) {
      const fromId = new mongoose.Types.ObjectId(from);
      await col("transactions").updateMany({ categoryId: fromId }, { $set: { categoryId: to } });
      const budgets = await col("budgets").find({ categoryId: fromId }).toArray();
      for (const budget of budgets) {
        const clash = await col("budgets").findOne({
          workspaceId: keeperId,
          categoryId: to,
          period: budget.period,
          periodStart: budget.periodStart ?? null,
        });
        if (clash) await col("budgets").deleteOne({ _id: budget._id });
        else await col("budgets").updateOne({ _id: budget._id }, { $set: { categoryId: to, workspaceId: keeperId } });
      }
      await col("categories").deleteOne({ _id: fromId });
    }

    for (const budget of await col("budgets").find({ workspaceId: dupId }).toArray()) {
      const clash = await col("budgets").findOne({
        workspaceId: keeperId,
        categoryId: budget.categoryId,
        period: budget.period,
        periodStart: budget.periodStart ?? null,
      });
      if (clash) await col("budgets").deleteOne({ _id: budget._id });
      else await col("budgets").updateOne({ _id: budget._id }, { $set: { workspaceId: keeperId } });
    }

    for (const rate of await col("fx_rates").find({ workspaceId: dupId }).toArray()) {
      const clash = await col("fx_rates").findOne({ workspaceId: keeperId, currency: rate.currency, effectiveFrom: rate.effectiveFrom });
      if (clash) await col("fx_rates").deleteOne({ _id: rate._id });
      else await col("fx_rates").updateOne({ _id: rate._id }, { $set: { workspaceId: keeperId } });
    }

    for (const name of ["transactions", "categories", "budget_pools", "savings_goals", "approval_requests", "workspace_invites", "notifications"]) {
      await col(name).updateMany({ workspaceId: dupId }, { $set: { workspaceId: keeperId } });
    }
    await col("workspace_members").deleteMany({ workspaceId: dupId });
    await col("workspaces").deleteOne({ _id: dupId });
    console.log(`  merged and deleted ${dupId}`);
  }
}

if (apply) {
  await col("workspaces").createIndex(
    { ownerUserId: 1 },
    { unique: true, partialFilterExpression: { kind: "personal" }, name: "one_personal_workspace_per_owner" },
  );
  console.log("\nIndex one_personal_workspace_per_owner is in place.");
} else if (groups.length > 0) {
  console.log("\nReport only. Re-run with --apply to merge.");
}

await mongoose.disconnect();
