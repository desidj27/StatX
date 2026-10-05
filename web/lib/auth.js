import { getSession } from "./session.js";
import { botIsInGuild, fetchUserGuilds, isGuildAdmin } from "./discord.js";
import { cacheGetOrSet } from "./cache.js";

const GUILDS_TTL_MS = 60_000;
const BOT_IN_GUILD_TTL_MS = 5 * 60_000;

function toAdminGuildSummary(guild) {
  return { id: guild.id, name: guild.name, icon: guild.icon };
}

/** Cookie-safe: only store IDs (full guild lists blow past browser cookie limits). */
function persistAdminGuildIds(session, adminGuilds) {
  session.adminGuildIds = adminGuilds.map((g) => g.id);
  delete session.adminGuilds;
}

async function loadAdminGuilds(accessToken) {
  return cacheGetOrSet(`guilds:${accessToken}`, GUILDS_TTL_MS, async () => {
    const guilds = await fetchUserGuilds(accessToken);
    return guilds.filter(isGuildAdmin).map(toAdminGuildSummary);
  });
}

export async function getSessionGuilds(session, { persist = false } = {}) {
  const adminGuilds = await loadAdminGuilds(session.accessToken);

  if (persist) {
    persistAdminGuildIds(session, adminGuilds);
    await session.save();
  }

  return adminGuilds;
}

export function sessionHasGuildAdmin(session, guildId) {
  return session.adminGuildIds?.includes(guildId) ?? false;
}

export async function requireUser() {
  const session = await getSession();
  if (!session.user?.id || !session.accessToken) {
    return { error: "unauthorized", status: 401 };
  }
  return { session };
}

export async function requireGuildAdmin(guildId, { checkBot = true } = {}) {
  const auth = await requireUser();
  if (auth.error) return auth;

  let isAdmin = sessionHasGuildAdmin(auth.session, guildId);
  let guildName = "Server";

  if (!isAdmin) {
    try {
      const guilds = await getSessionGuilds(auth.session, { persist: true });
      const match = guilds.find((g) => g.id === guildId);
      if (!match) return { error: "forbidden", status: 403 };
      isAdmin = true;
      guildName = match.name;
    } catch (err) {
      console.error("Guild auth error:", err);
      return { error: "relogin_required", status: 401 };
    }
  }

  if (checkBot) {
    try {
      const botPresent = await cacheGetOrSet(
        `bot:${guildId}`,
        BOT_IN_GUILD_TTL_MS,
        () => botIsInGuild(guildId)
      );
      if (!botPresent) {
        return { error: "bot_not_in_guild", status: 404 };
      }
    } catch (err) {
      console.error("Bot guild check error:", err);
      return { error: "discord_api_error", status: 502 };
    }
  }

  return {
    session: auth.session,
    guild: { id: guildId, name: guildName },
  };
}
