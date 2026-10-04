// ban.js
import {
  MessageFlags,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { formatBanLogMessage } from "./guild-settings.js";

export async function sendBanLog(guild, settings, { user, reason, bannedByUserId }) {
  const channelId = settings?.channels?.ban_log;
  if (!channelId) return;

  const logChannel = await guild.channels.fetch(channelId).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const template =
    settings?.messages?.ban_log_template ??
    "**RIP** :headstone: `{tag}` ||{user_id}||\nBanned for {reason}\nBanned by <@{banned_by}>";

  const content = formatBanLogMessage(template, {
    tag: user.tag,
    userId: user.id,
    reason,
    bannedByUserId,
  });

  await logChannel.send({
    content,
    allowedMentions: { users: [bannedByUserId] },
  });
}

/** Human-readable reason when member.bannable is false. */
export function whyNotBannable(member) {
  const me = member.guild.members.me;
  if (!me) return "bot member not loaded";
  if (!me.permissions.has(PermissionFlagsBits.BanMembers)) {
    return "bot lacks Ban Members permission";
  }
  if (member.id === member.guild.ownerId) return "user is the server owner";
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return "user has Administrator";
  }
  if (!member.bannable) {
    return `role too high (user role position ${member.roles.highest.position}, bot ${me.roles.highest.position})`;
  }
  return null;
}

export async function banGuildMember(member, reason) {
  if (whyNotBannable(member)) return false;
  await member.ban({ reason });
  return true;
}

const lastAutoBanWarnAtByUserId = new Map();
const AUTO_BAN_WARN_COOLDOWN_MS = 60_000;

function warnAutoBanSkipped(member) {
  const now = Date.now();
  const last = lastAutoBanWarnAtByUserId.get(member.id) ?? 0;
  if (now - last < AUTO_BAN_WARN_COOLDOWN_MS) return;
  lastAutoBanWarnAtByUserId.set(member.id, now);

  const detail = whyNotBannable(member) ?? "unknown";
  console.warn(
    `Auto-ban: could not ban ${member.user.tag} (${member.id}) — ${detail}`
  );
}

/** Ban anyone who posts in the trap channel; delete their message first. */
export async function handleAutoBanChannelMessage(message, settings) {
  if (!settings?.features?.moderation) return false;

  const trapChannelId = settings?.channels?.auto_ban_trap;
  if (!trapChannelId || message.channelId !== trapChannelId) return false;
  if (!message.guild) return false;
  if (message.author?.bot) return false;

  await message.delete().catch(() => {});

  const member = await message.guild.members
    .fetch(message.author.id)
    .catch(() => null);

  if (!member) return true;

  const reason =
    settings?.messages?.auto_ban_reason ?? "Posted in restricted channel";

  if (!(await banGuildMember(member, reason))) {
    warnAutoBanSkipped(member);
    return true;
  }

  const bannedByUserId = message.client.user?.id ?? message.author.id;
  await sendBanLog(message.guild, settings, {
    user: message.author,
    reason,
    bannedByUserId,
  });

  return true;
}

export const banCommand = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member from the server")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user to ban")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the ban")
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function handleBan(interaction, settings) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.inGuild()) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  if (!settings?.features?.moderation) {
    await interaction.editReply(
      "Moderation is disabled on this server. Admins can enable it in the web dashboard."
    );
    return;
  }

  const target = interaction.options.getUser("user", true);
  const reason =
    interaction.options.getString("reason") ?? "No reason provided";

  const member = await interaction.guild.members
    .fetch(target.id)
    .catch(() => null);

  if (!member) {
    await interaction.editReply("User not found in this guild.");
    return;
  }

  if (!member.bannable) {
    await interaction.editReply("I cannot ban this user (role/permission issue).");
    return;
  }

  await member.ban({ reason });

  await sendBanLog(interaction.guild, settings, {
    user: target,
    reason,
    bannedByUserId: interaction.user.id,
  });

  await interaction.editReply(`Banned **${target.tag}** successfully.`);
}
