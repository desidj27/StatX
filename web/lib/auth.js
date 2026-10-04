import { getSession } from "./session.js";
import { botIsInGuild, fetchUserGuilds, isGuildAdmin } from "./discord.js";

function toAdminGuildSummary(guild) {
  return { id: guild.id, name: guild.name, icon: guild.icon };
}

function persistAdminGuilds(session, adminGuilds) {
  session.adminGuilds = adminGuilds;
  session.adminGuildIds = adminGuilds.map((g) => g.id);
}

export async function getSessionGuilds(session, { persist = false } = {}) {
  if (session.adminGuilds?.length) {
    return session.adminGuilds;
  }

  const guilds = await fetchUserGuilds(session.accessToken);
  const adminGuilds = guilds.filter(isGuildAdmin).map(toAdminGuildSummary);

  if (persist) {
    persistAdminGuilds(session, adminGuilds);
    await session.save();
  }

  return adminGuilds;
}

export function sessionHasGuildAdmin(session, guildId) {
  if (session.adminGuildIds?.includes(guildId)) return true;
  return session.adminGuilds?.some((g) => g.id === guildId) ?? false;
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

  let guild = auth.session.adminGuilds?.find((g) => g.id === guildId);

  if (!sessionHasGuildAdmin(auth.session, guildId)) {
    try {
      const guilds = await getSessionGuilds(auth.session, { persist: true });
      guild = guilds.find((g) => g.id === guildId);
    } catch (err) {
      console.error("Guild auth error:", err);
      return { error: "relogin_required", status: 401 };
    }
  } else if (!guild) {
    guild = { id: guildId, name: "Server" };
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
