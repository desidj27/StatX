import { DB } from "./db.js";
import { addUtcDays, todayInTz } from "./periods.js";

export const FREE_HISTORY_DAYS = 90;

const premiumCache = new Map();
const CACHE_TTL_MS = 60_000;

export async function isPremiumGuild(guildId) {
  const hit = premiumCache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.premium;
  }

  const sub = await DB.getGuildSubscription(guildId);
  const premium = sub?.plan === "premium" && sub?.status !== "canceled";
  premiumCache.set(guildId, { premium, at: Date.now() });
  return premium;
}

export function invalidatePlanCache(guildId) {
  premiumCache.delete(guildId);
}

/** Earliest stats day visible on the free plan, or null if unlimited. */
export async function getMinVisibleDay(guildId, timeZone = "America/New_York") {
  if (await isPremiumGuild(guildId)) return null;
  const today = todayInTz(timeZone);
  return addUtcDays(today, -(FREE_HISTORY_DAYS - 1));
}

export function clampRangeToMinDay(range, minDay) {
  if (!minDay || range.start >= minDay) return range;

  const capped = { ...range, start: minDay };
  if (range.label === "All time" || range.label?.startsWith("All time")) {
    capped.label = `Last ${FREE_HISTORY_DAYS} days (upgrade for full history)`;
  } else if (!range.label?.includes("upgrade")) {
    capped.label = `${range.label} (max ${FREE_HISTORY_DAYS} days on free plan)`;
  }
  return capped;
}

export async function applyPlanToRange(guildId, range, timeZone = "America/New_York") {
  const minDay = await getMinVisibleDay(guildId, timeZone);
  return clampRangeToMinDay(range, minDay);
}

export function premiumUpsellNote() {
  return `_Free plan shows the last ${FREE_HISTORY_DAYS} days. Upgrade for full history._`;
}
