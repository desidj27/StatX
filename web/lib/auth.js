import { getSession } from "./session.js";
import { botIsInGuild, fetchUserGuilds, isGuildAdmin } from "./discord.js";

function toAdminGuildSummary(guild) {
  return { id: guild.id, name: guild.name, icon: guild.icon };
}

/** Cookie-safe: only store IDs (full guild lists blow past browser cookie limits). */
function persistAdminGuildIds(session, adminGuilds) {
  session.adminGuildIds = adminGuilds.map((g) => g.id);
  delete session.adminGuilds;
}

export async function getSessionGuilds(session, { persist = false } = {}) {
  const guilds = await fetchUserGuilds(session.accessToken);
  const adminGuilds = guilds.filter(isGuildAdmin).map(toAdminGuildSummary);

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

export async function requireGuildAdmin(guildId) {
  const auth = await requireUser();
  if (auth.error) return auth;

  let guild = null;

  if (!sessionHasGuildAdmin(auth.session, guildId)) {
    try {
      const guilds = await getSessionGuilds(auth.session, { persist: true });
      guild = guilds.find((g) => g.id === guildId);
    } catch (err) {
      console.error("Guild auth error:", err);
      return { error: "relogin_required", status: 401 };
    }
  } else {
    // IDs-only session: resolve name/icon from Discord when needed
    try {
      const guilds = await getSessionGuilds(auth.session, { persist: false });
      guild = guilds.find((g) => g.id === guildId) ?? { id: guildId, name: "Server" };
    } catch {
      guild = { id: guildId, name: "Server" };
    }
  }

  if (!guild) {
    return { error: "forbidden", status: 403 };
  }

  try {
    const botPresent = await botIsInGuild(guildId);
    if (!botPresent) {
      return { error: "bot_not_in_guild", status: 404 };
    }
  } catch (err) {
    console.error("Bot guild check error:", err);
    return { error: "discord_api_error", status: 502 };
  }

  return { session: auth.session, guild };
}
