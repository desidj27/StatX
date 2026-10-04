import { DB } from "./db.js";

const CACHE_TTL_MS = 30_000;
const REVISION_POLL_MS = 2_000;
const cache = new Map();

export const DEFAULT_GUILD_SETTINGS = {
  features: {
    economy: true,
    moderation: true,
    quotes: true,
    recaps: false,
    boost_shame: false,
  },
  channels: {
    ban_log: null,
    auto_ban_trap: null,
    quote: null,
    recap: null,
    boost_shame: null,
  },
  messages: {
    auto_ban_reason: "Posted in restricted channel",
    ban_log_template:
      "**RIP** :headstone: `{tag}` ||{user_id}||\nBanned for {reason}\nBanned by <@{banned_by}>",
    boost_shame_template:
      "# :rotating_light: {mention} `{username}` ||{user_id}|| :rotating_light:\n# Has stopped boosting!!!",
  },
  timezone: "America/New_York",
  economy: {
    daily_reward_base: 500,
    daily_streak_increment: 25,
    daily_streak_bonus_cap: 30,
  },
  recap_state: {
    last_weekly_recap_ms: null,
    last_yearly_recap_year: null,
  },
};

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object"
    ) {
      out[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function mergeGuildSettings(stored) {
  return deepMerge(DEFAULT_GUILD_SETTINGS, stored ?? {});
}

export async function getGuildSettings(guildId) {
  const now = Date.now();
  const hit = cache.get(guildId);

  if (hit && now - hit.at < CACHE_TTL_MS) {
    if (now - (hit.versionCheckedAt ?? 0) < REVISION_POLL_MS) {
      return hit.settings;
    }
    const updatedAt = await DB.getGuildSettingsUpdatedAt(guildId);
    hit.versionCheckedAt = now;
    if (updatedAt === hit.updatedAtMs) {
      return hit.settings;
    }
  }

  const stored = await DB.getGuildSettings(guildId);
  const settings = mergeGuildSettings(stored);
  cache.set(guildId, {
    settings,
    at: now,
    updatedAtMs: stored?.updated_at_ms ?? null,
    versionCheckedAt: now,
  });
  return settings;
}

export function invalidateGuildSettingsCache(guildId) {
  cache.delete(guildId);
}

export async function ensureGuildSettings(guildId) {
  await DB.ensureGuildSettings(guildId);
  invalidateGuildSettingsCache(guildId);
}

export async function updateGuildSettings(guildId, patch) {
  await DB.updateGuildSettings(guildId, patch);
  invalidateGuildSettingsCache(guildId);
  return getGuildSettings(guildId);
}

export function formatBanLogMessage(template, { tag, userId, reason, bannedByUserId }) {
  return template
    .replaceAll("{tag}", tag)
    .replaceAll("{user_id}", userId)
    .replaceAll("{reason}", reason)
    .replaceAll("{banned_by}", bannedByUserId);
}

export function formatBoostShameMessage(template, { mention, username, userId }) {
  return template
    .replaceAll("{mention}", mention)
    .replaceAll("{username}", username)
    .replaceAll("{user_id}", userId);
}
