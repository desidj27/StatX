import { AuditLogEvent, MessageType } from "discord.js";

export const BOOST_MESSAGE_TYPES = new Set([
  MessageType.GuildBoost,
  MessageType.GuildBoostTier1,
  MessageType.GuildBoostTier2,
  MessageType.GuildBoostTier3,
]);

const BOOST_CONTENT_RE =
  /\*\*(.+?)\*\* just boosted the server|just boosted the server/i;

/** Discord boost system message (type 8–11 or matching text). */
export function isBoostNotificationMessage(message) {
  if (BOOST_MESSAGE_TYPES.has(message.type)) return true;
  const text = message.content ?? "";
  return BOOST_CONTENT_RE.test(text);
}

/** Resolve booster user id from a boost system message. */
export async function resolveBoosterUserId(message) {
  const fromMention = message.mentions.users.first()?.id;
  if (fromMention) return fromMention;

  const fromMeta = message.interactionMetadata?.user?.id;
  if (fromMeta) return fromMeta;

  const legacyInteraction = message.interaction?.user?.id;
  if (legacyInteraction) return legacyInteraction;

  const mentionInText = message.content?.match(/<@!?(\d{17,20})>/);
  if (mentionInText) return mentionInText[1];

  const nameMatch = message.content?.match(/\*\*(.+?)\*\* just boosted the server/i);
  if (nameMatch && message.guild) {
    const name = nameMatch[1].trim();
    const lower = name.toLowerCase();
    const matchMember = (m) =>
      m.user.username.toLowerCase() === lower ||
      m.displayName.toLowerCase() === lower ||
      m.user.globalName?.toLowerCase() === lower;

    const cached = message.guild.members.cache.find(matchMember);
    if (cached) return cached.id;

    try {
      const members = await message.guild.members.fetch({ query: name, limit: 10 });
      const hit = members.find(matchMember);
      if (hit) return hit.id;
      if (members.size === 1) return members.first().id;
    } catch (err) {
      console.warn("[boost] member search failed:", err?.message ?? err);
    }
  }

  if (message.guild) {
    const fromAudit = await resolveBoosterFromAuditLog(message.guild);
    if (fromAudit) return fromAudit;
  }

  return message.author?.id ?? null;
}

async function resolveBoosterFromAuditLog(guild) {
  try {
    const logs = await guild.fetchAuditLogs({
      limit: 8,
      actionType: AuditLogEvent.MemberUpdate,
    });
    const now = Date.now();
    for (const [, entry] of logs.entries) {
      if (now - entry.createdTimestamp > 30_000) continue;
      const premiumChange = entry.changes?.find(
        (c) => c.key === "premium_since" || c.key === "premiumSince"
      );
      if (premiumChange?.new && !premiumChange?.old) {
        return entry.targetId ?? entry.executorId ?? null;
      }
    }
  } catch (err) {
    console.warn("[boost] audit log lookup failed:", err?.message ?? err);
  }
  return null;
}
