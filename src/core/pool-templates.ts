import type { PoolRules } from "@/src/core/pool-rules";
import type { PoolAllocation } from "@/src/core/pool-contributions";

/**
 * Starting points for a new pool. Each sets what such a pool usually needs,
 * scaled to its limit; everything can be changed afterwards on the pool.
 *
 * - Trip: dates, everyone going splits it equally, small spends approve on their own.
 * - Household: everyone splits it equally, everyday spends approve on their own.
 * - Event: dates; no split; nothing approves on its own.
 * - Team: a monthly limit per member (the pool shared evenly), tiny spends approve on their own.
 *
 * Each also makes sure the workspace has the categories such spending goes in.
 */
export const POOL_TEMPLATES = ["trip", "household", "event", "team"] as const;
export type PoolTemplate = (typeof POOL_TEMPLATES)[number];

type CategorySeed = { name: string; icon: string; color: string };

export const POOL_TEMPLATE_INFO: Record<PoolTemplate, { label: string; description: string; needsDates: boolean; categories: CategorySeed[] }> = {
  trip: {
    label: "Trip",
    description: "Shared travel: everyone going splits it equally, and small spends approve on their own.",
    needsDates: true,
    categories: [
      { name: "Travel", icon: "plane", color: "#52D3FE" },
      { name: "Stay", icon: "bed", color: "#B28DFF" },
      { name: "Food and drinks", icon: "utensils", color: "#FFB547" },
      { name: "Activities", icon: "ticket", color: "#3DDC97" },
    ],
  },
  household: {
    label: "Household",
    description: "A shared pot at home: everyone splits it equally, and everyday spends approve on their own.",
    needsDates: false,
    categories: [
      { name: "Groceries", icon: "shopping-basket", color: "#3DDC97" },
      { name: "Utilities", icon: "plug", color: "#52D3FE" },
      { name: "Household help", icon: "hand-helping", color: "#B28DFF" },
    ],
  },
  event: {
    label: "Event",
    description: "A one-off: venue, catering and the rest, with every spend reviewed.",
    needsDates: true,
    categories: [
      { name: "Venue", icon: "building", color: "#C9A227" },
      { name: "Catering", icon: "utensils", color: "#FFB547" },
      { name: "Decor and supplies", icon: "sparkles", color: "#F7A1C4" },
    ],
  },
  team: {
    label: "Team",
    description: "A team budget: each member gets an even monthly share of it, and tiny spends approve on their own.",
    needsDates: false,
    categories: [
      { name: "Software and subscriptions", icon: "laptop", color: "#B28DFF" },
      { name: "Office and supplies", icon: "briefcase", color: "#C9A227" },
      { name: "Meals and entertainment", icon: "utensils", color: "#FFB547" },
    ],
  },
};

/** Rounded down to a whole unit (100 minor), so presets read cleanly. */
function whole(minor: number) {
  return Math.floor(minor / 100) * 100;
}

/** The rules and shares a template starts a pool with, for its limit and the workspace's members. */
export function templateSetup(template: PoolTemplate, limitMinor: number, memberIds: readonly string[]): { rules: Partial<PoolRules>; allocation: PoolAllocation } {
  const everyone = memberIds.map((userId) => ({ userId, value: 0 }));
  const equal: PoolAllocation = everyone.length ? { mode: "equal", targetMinor: null, shares: everyone } : { mode: "none", targetMinor: null, shares: [] };
  const none: PoolAllocation = { mode: "none", targetMinor: null, shares: [] };
  switch (template) {
    case "trip":
      return { rules: { autoApproveUpToMinor: whole(limitMinor * 0.1) || null }, allocation: equal };
    case "household":
      return { rules: { autoApproveUpToMinor: whole(limitMinor * 0.05) || null }, allocation: equal };
    case "event":
      return { rules: { autoApproveUpToMinor: null }, allocation: none };
    case "team":
      return {
        rules: {
          autoApproveUpToMinor: whole(limitMinor * 0.02) || null,
          memberLimitMinor: memberIds.length ? whole(limitMinor / memberIds.length) || null : null,
          memberLimitPeriod: "monthly",
        },
        allocation: none,
      };
  }
}

/** Categories a template needs that the workspace doesn't have yet (by name, any case). */
export function missingCategories(template: PoolTemplate, existingNames: readonly string[]): CategorySeed[] {
  const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  return POOL_TEMPLATE_INFO[template].categories.filter((c) => !have.has(c.name.toLowerCase()));
}
