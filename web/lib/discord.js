const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_OAUTH_AUTHORIZE = "https://discord.com/oauth2/authorize";
const ADMINISTRATOR = 0x8n;

export function appBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function discordOAuthUrl() {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appBaseUrl()}/api/auth/callback`,
    response_type: "code",
    scope: "identify guilds",
  });
  return `${DISCORD_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${appBaseUrl()}/api/auth/callback`,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Discord user");
  return res.json();
}

export async function fetchUserGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch guilds");
  return res.json();
}

export function isGuildAdmin(guild) {
  try {
    const perms = BigInt(guild.permissions);
    return (perms & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

export function defaultAvatarUrl(userId) {
  const index = Number(BigInt(userId) % 5n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function memberAvatarUrl(userId, avatarHash) {
  if (!avatarHash) return defaultAvatarUrl(userId);
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`;
}

export async function fetchGuildMember(guildId, userId) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return null;

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function resolveActivityIconUrl(applicationId, activityName) {
  const { resolveKnownActivityIcon, resolveActivityApplicationId } = await import(
    "../../src/activity-meta.js"
  );
  const appId = resolveActivityApplicationId(activityName, applicationId);
  return resolveKnownActivityIcon({
    activity_name: activityName,
    application_id: appId,
  });
}

export async function resolveMemberProfiles(guildId, userIds) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const profiles = {};

  await Promise.all(
    unique.map(async (userId) => {
      const member = await fetchGuildMember(guildId, userId);
      if (!member?.user) {
        profiles[userId] = {
          user_id: userId,
          display_name: `User ${userId.slice(-4)}`,
          username: userId,
          avatar_url: defaultAvatarUrl(userId),
        };
        return;
      }

      const user = member.user;
      profiles[userId] = {
        user_id: userId,
        display_name: member.nick ?? user.global_name ?? user.username,
        username: user.username,
        avatar_url: memberAvatarUrl(userId, user.avatar),
      };
    })
  );

  return profiles;
}

export async function fetchGuildSummary(guildId) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    return { id: guildId, name: guildId, icon: null, bot_present: false };
  }

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    return { id: guildId, name: guildId, icon: null, bot_present: false };
  }

  const guild = await res.json();
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
      : null,
    bot_present: true,
  };
}

export async function fetchGuildSummaries(guildIds) {
  const summaries = {};
  await Promise.all(
    guildIds.map(async (guildId) => {
      summaries[guildId] = await fetchGuildSummary(guildId);
    })
  );
  return summaries;
}

export async function botIsInGuild(guildId) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return false;

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  return res.ok;
}
