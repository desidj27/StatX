// index.js
import "dotenv/config";
import { banCommand, handleBan, handleAutoBanChannelMessage } from "./ban.js";
import {
  activitiesCommand,
  handleActivities,
  handleActivitiesPageButton,
} from "./activities.js";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  SlashCommandBuilder,
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DB, mongoConnectionLabel, requireMongoEnv } from "./db.js";
import {
  logInteractionReceived,
  safeDeferReply,
  safeDeferUpdate,
} from "./interaction-utils.js";
import {
  statsCommand,
  handleStats,
  handleStatsPeriodButton,
} from "./stats.js";
import { formatHMS } from "./periods.js";
import {
  isBoostNotificationMessage,
  resolveBoosterUserId,
} from "./boost-log.js";
import {
  ensureGuildSettings,
  formatBoostShameMessage,
  getGuildSettings,
  updateGuildSettings,
} from "./guild-settings.js";
import { getMinVisibleDay, isPremiumGuild, premiumUpsellNote } from "./plan.js";
import {
  activityMetaFromDiscordActivity,
  trackedActivityFromPresence,
} from "./activity-meta.js";

// QUOTE RENDERER (your existing one)
import { renderQuoteImage } from "./render_quote.js";

// ---------------- ENV ----------------

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN");
}

requireMongoEnv();

// ---------------- ERROR VISIBILITY ----------------

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ---------------- CLIENT ----------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent, // REQUIRED for quote rendering
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

const recentBoostLogMs = new Map();

async function recordBoostStart(guildId, userId, boostedAtMs) {
  if (!guildId || !userId || !boostedAtMs) return;

  const key = `${guildId}:${userId}`;
  const last = recentBoostLogMs.get(key) ?? 0;
  if (boostedAtMs - last < 60_000) return;
  recentBoostLogMs.set(key, boostedAtMs);

  await DB.logBoostStart(guildId, userId, boostedAtMs);
  console.log(`[boost] logged user=${userId} guild=${guildId} at=${boostedAtMs}`);
}

// ---------------- SHAME (BOOST DROPS) ----------------

const shameCooldownMs = 6 * 60 * 60 * 1000; // 6 hours per-user
const lastShamedAtByUserId = new Map();
const FEATURE_DISABLED =
  "This feature is disabled on this server. Server admins can enable it in the web dashboard.";

async function shameBoosterDrop(member) {
  const settings = await getGuildSettings(member.guild.id);
  if (!settings.features.boost_shame || !settings.channels.boost_shame) return;

  const now = Date.now();
  const last = lastShamedAtByUserId.get(member.id) ?? 0;
  if (now - last < shameCooldownMs) return;
  lastShamedAtByUserId.set(member.id, now);

  const channel = await member.guild.channels
    .fetch(settings.channels.boost_shame)
    .catch(() => null);
  if (!channel?.isTextBased()) return;

  const username = member.user?.username ?? member.id;
  const template =
    settings.messages.boost_shame_template ??
    "# :rotating_light: {mention} `{username}` ||{user_id}|| :rotating_light:\n# Has stopped boosting!!!";

  await channel
    .send(
      formatBoostShameMessage(template, {
        mention: `${member}`,
        username,
        userId: member.id,
      })
    )
    .catch(() => {});
}

// ---------------- COMMAND DEFINITIONS ----------------

// Message context menu: Quote
const quoteCommand = new ContextMenuCommandBuilder()
  .setName("Quote")
  .setType(ApplicationCommandType.Message);

const avatarCommand = new SlashCommandBuilder()
  .setName("avatar")
  .setDescription("Show a user's avatar.")
  .addUserOption((o) =>
    o.setName("user").setDescription("User to view").setRequired(true)
  )
  .addStringOption((o) =>
    o
      .setName("type")
      .setDescription("Which avatar to show")
      .setRequired(false)
      .addChoices(
        { name: "Global (main profile)", value: "global" },
        { name: "Guild (this server)", value: "guild" }
      )
  );

const infoCommand = new SlashCommandBuilder()
  .setName("info")
  .setDescription("Show info + activity totals for a user.")
  .addUserOption((o) =>
    o.setName("user").setDescription("User to inspect").setRequired(true)
  );

const guildInfoCommand = new SlashCommandBuilder()
  .setName("guildinfo")
  .setDescription("Show stats and info about this server.");

const balanceCommand = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your balance.")
  .addUserOption((o) =>
    o.setName("user").setDescription("User to check (optional)").setRequired(false)
  );

const dailyCommand = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily coins.");

const coinflipCommand = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("Bet coins on a coin flip.")
  .addIntegerOption((o) =>
    o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
  )
  .addStringOption((o) =>
    o
      .setName("side")
      .setDescription("Heads or tails")
      .setRequired(true)
      .addChoices(
        { name: "Heads", value: "heads" },
        { name: "Tails", value: "tails" }
      )
  );

const diceCommand = new SlashCommandBuilder()
  .setName("dice")
  .setDescription("Bet coins by guessing a 1-6 roll.")
  .addIntegerOption((o) =>
    o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
  )
  .addIntegerOption((o) =>
    o
      .setName("guess")
      .setDescription("Your guess (1-6)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(6)
  );

const highlowCommand = new SlashCommandBuilder()
  .setName("highlow")
  .setDescription("Bet whether the next card is higher or lower.")
  .addIntegerOption((o) =>
    o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
  );

const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show available commands.");

// ---------------- COMMAND REGISTRATION ----------------

async function registerCommands(applicationId, discordClient) {
  const rest = new REST({ version: "10" }).setToken(token);

  const commands = [
    statsCommand.toJSON(),
    avatarCommand.toJSON(),
    infoCommand.toJSON(),
    guildInfoCommand.toJSON(),
    activitiesCommand.toJSON(),
    balanceCommand.toJSON(),
    dailyCommand.toJSON(),
    coinflipCommand.toJSON(),
    diceCommand.toJSON(),
    highlowCommand.toJSON(),
    helpCommand.toJSON(),
    quoteCommand.toJSON(),
    banCommand.toJSON(),
  ];

  let targetGuildId = null;
  if (guildId && discordClient.guilds.cache.has(guildId)) {
    targetGuildId = guildId;
  } else if (guildId) {
    console.warn(
      `GUILD_ID=${guildId} is set but this bot is not in that server — skipping guild commands for that ID.`
    );
  }

  if (targetGuildId) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(applicationId, targetGuildId),
        { body: commands }
      );
      console.log(
        `Registered GUILD commands for app ${applicationId} guild ${targetGuildId}`
      );
      return;
    } catch (err) {
      console.warn(
        `Guild command registration failed (${err?.code ?? err?.message}); trying GLOBAL...`
      );
    }
  }

  await rest.put(Routes.applicationCommands(applicationId), { body: commands });
  console.log(`Registered GLOBAL commands for app ${applicationId}`);
}

// ---------------- MESSAGE TRACKING (STATS) ----------------

client.on("messageCreate", async (message) => {
  try {
    if (!message.guildId) return;

    if (isBoostNotificationMessage(message)) {
      const userId = await resolveBoosterUserId(message);
      if (userId) {
        await recordBoostStart(
          message.guildId,
          userId,
          message.createdTimestamp ?? Date.now()
        );
      } else {
        console.warn(
          "[boost] could not resolve booster",
          message.id,
          "type=",
          message.type,
          "content=",
          message.content?.slice(0, 120)
        );
      }
      return;
    }

    if (!message.author || message.author.bot) return;

    const settings = await getGuildSettings(message.guildId);
    if (await handleAutoBanChannelMessage(message, settings)) return;

    const day = dayString(Date.now(), settings.timezone);

    await DB.incUserMsg({
      guild_id: message.guildId,
      user_id: message.author.id,
      day,
    });

    await DB.incChannelMsg({
      guild_id: message.guildId,
      channel_id: message.channelId,
      day,
    });
  } catch (err) {
    console.error("messageCreate error:", err);
  }
});

// ---------------- VOICE TRACKING (STATS) ----------------

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const guildId = newState.guild.id;
    const userId = newState.id;

    const member = newState.member ?? oldState.member;
    if (member?.user?.bot) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (!oldChannelId && newChannelId) {
      await DB.upsertSession({
        guild_id: guildId,
        user_id: userId,
        channel_id: newChannelId,
        started_at_ms: Date.now(),
      });
      return;
    }

    if (oldChannelId && !newChannelId) {
      await closeSession(guildId, userId);
      return;
    }

    if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
      await closeSession(guildId, userId);
      await DB.upsertSession({
        guild_id: guildId,
        user_id: userId,
        channel_id: newChannelId,
        started_at_ms: Date.now(),
      });
    }
  } catch (err) {
    console.error("voiceStateUpdate error:", err);
  }
});

client.on("presenceUpdate", async (oldPresence, newPresence) => {
  try {
    const presence = newPresence ?? oldPresence;
    const guildId = presence?.guild?.id;
    const userId = presence?.userId;
    if (!guildId || !userId) return;

    const member = presence.member ?? (await presence.guild.members.fetch(userId).catch(() => null));
    if (member?.user?.bot) return;

    const tracked = await trackedActivityFromPresence(newPresence);
    if (tracked && (tracked.image_url || tracked.application_id)) {
      await DB.upsertActivityMeta({
        guild_id: guildId,
        activity_name: tracked.activity_name,
        image_url: tracked.image_url,
        application_id: tracked.application_id,
      });
    }
    await updateActivitySession({
      guildId,
      userId,
      nextActivityName: tracked?.activity_name ?? null,
      nowMs: Date.now(),
    });
  } catch (err) {
    console.error("presenceUpdate error:", err);
  }
});

const TIME_ZONE = "America/New_York"; // EST/EDT

function tzOffsetMinutesAt(timeZone, date) {
  // Returns offset minutes (e.g. UTC-4 => -240)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2] ?? 0);
  const mm = Number(m[3] ?? 0);
  return sign * (hh * 60 + mm);
}

function dayString(ms, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function startOfDayMsInTz(ms, timeZone = TIME_ZONE) {
  const ymd = dayString(ms, timeZone);
  const [y, m, d] = ymd.split("-").map(Number);
  const utcBase = Date.UTC(y, m - 1, d, 0, 0, 0, 0);

  // First guess using offset at utcBase, then re-check at computed instant (handles DST flips).
  let off = tzOffsetMinutesAt(timeZone, new Date(utcBase));
  let utc = utcBase - off * 60_000;
  const off2 = tzOffsetMinutesAt(timeZone, new Date(utc));
  if (off2 !== off) {
    off = off2;
    utc = utcBase - off * 60_000;
  }
  return utc;
}

/** First instant of the next calendar day in TIME_ZONE (for daily reset). */
function startOfNextCalendarDayMsInTz(nowMs, timeZone = TIME_ZONE) {
  const today = dayString(nowMs, timeZone);
  let t = nowMs + 60 * 60 * 1000;
  while (dayString(t, timeZone) === today) t += 60 * 60 * 1000;
  return startOfDayMsInTz(t, timeZone);
}

function formatDiscordTs(ms) {
  const s = Math.floor(ms / 1000);
  return `<t:${s}:F> (<t:${s}:R>)`;
}

/** Default economy tuning when guild settings are missing. */
const DEFAULT_DAILY_REWARD_BASE = 500;
const DEFAULT_DAILY_STREAK_INCREMENT = 25;
const DEFAULT_DAILY_STREAK_BONUS_CAP = 30;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLAYING_CARDS_DIR_CANDIDATES = [
  path.resolve(__dirname, "../assets/playing_cards"),
  path.resolve(__dirname, "../assets/playing-cards"),
  path.resolve(__dirname, "../assets/cards"),
  path.resolve(__dirname, "./assets/playing_cards"),
  path.resolve(__dirname, "./assets/playing-cards"),
  path.resolve(__dirname, "./assets/cards"),
];
const DICE_ASSETS_DIR_CANDIDATES = [
  path.resolve(__dirname, "../assets/dice"),
  path.resolve(__dirname, "./assets/dice"),
];
const HIGHLOW_GAME_TTL_MS = 2 * 60_000;
const highlowGames = new Map();
let cardFilesByRank = null;
let diceFilesByFace = null;
let resolvedPlayingCardsDir = null;
let resolvedDiceAssetsDir = null;

function dailyRewardForStreak(streak, economy = {}) {
  const base = economy.daily_reward_base ?? DEFAULT_DAILY_REWARD_BASE;
  const increment =
    economy.daily_streak_increment ?? DEFAULT_DAILY_STREAK_INCREMENT;
  const cap = economy.daily_streak_bonus_cap ?? DEFAULT_DAILY_STREAK_BONUS_CAP;
  const capped = Math.min(Math.max(streak, 1), cap);
  return base + (capped - 1) * increment;
}

function cardLabel(rank) {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return `${rank}`;
}

function findExistingAssetDir(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseCardRankFromFilename(file) {
  const base = path.basename(file, path.extname(file)).toLowerCase();
  const tokens = base.split(/[^a-z0-9]+/).filter(Boolean);

  for (const token of tokens) {
    if (token === "a" || token === "ace") return 14;
    if (token === "k" || token === "king") return 13;
    if (token === "q" || token === "queen") return 12;
    if (token === "j" || token === "jack") return 11;

    const n = Number(token);
    if (Number.isInteger(n) && n >= 2 && n <= 10) return n;
  }

  return null;
}

function loadCardFilesByRank() {
  if (cardFilesByRank != null && cardFilesByRank.size > 0) return cardFilesByRank;
  cardFilesByRank = new Map();

  resolvedPlayingCardsDir = findExistingAssetDir(PLAYING_CARDS_DIR_CANDIDATES);
  if (!resolvedPlayingCardsDir) return cardFilesByRank;
  const files = fs.readdirSync(resolvedPlayingCardsDir);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== ".png") continue;
    const rank = parseCardRankFromFilename(file);
    if (rank == null) continue;
    const list = cardFilesByRank.get(rank) ?? [];
    list.push(file);
    cardFilesByRank.set(rank, list);
  }

  return cardFilesByRank;
}

function maybeCardAttachment(rank, prefix) {
  const byRank = loadCardFilesByRank();
  const files = byRank.get(rank) ?? [];
  if (files.length === 0) return null;
  if (!resolvedPlayingCardsDir) return null;
  const file = files[Math.floor(Math.random() * files.length)];
  const attachmentName = `${prefix}-${Date.now()}-${file}`;
  const attachmentPath = path.join(resolvedPlayingCardsDir, file);

  return {
    file: new AttachmentBuilder(attachmentPath, { name: attachmentName }),
    url: `attachment://${attachmentName}`,
  };
}

function loadDiceFilesByFace() {
  if (diceFilesByFace != null && diceFilesByFace.size > 0) return diceFilesByFace;
  diceFilesByFace = new Map();

  resolvedDiceAssetsDir = findExistingAssetDir(DICE_ASSETS_DIR_CANDIDATES);
  if (!resolvedDiceAssetsDir) return diceFilesByFace;
  const files = fs.readdirSync(resolvedDiceAssetsDir);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== ".png") continue;
    const lower = file.toLowerCase();

    const matches = lower.match(/\d+/g) ?? [];
    for (let face = 1; face <= 6; face++) {
      const faceToken = String(face);
      const hasFace = matches.includes(faceToken) || lower.includes(`dice${faceToken}`);
      if (!hasFace) continue;

      const list = diceFilesByFace.get(face) ?? [];
      list.push(file);
      diceFilesByFace.set(face, list);
    }
  }

  return diceFilesByFace;
}

function maybeDiceAttachment(face, prefix) {
  const byFace = loadDiceFilesByFace();
  const files = byFace.get(face) ?? [];
  if (files.length === 0) return null;
  if (!resolvedDiceAssetsDir) return null;
  const file = files[Math.floor(Math.random() * files.length)];
  const attachmentName = `${prefix}-${Date.now()}-${file}`;
  const attachmentPath = path.join(resolvedDiceAssetsDir, file);

  return {
    file: new AttachmentBuilder(attachmentPath, { name: attachmentName }),
    url: `attachment://${attachmentName}`,
  };
}

async function ensureBettable(interaction, bet) {
  if (bet <= 0) {
    await interaction.reply({ content: "Bet must be at least 1.", ephemeral: true });
    return null;
  }
  const bal = await DB.getBalance(interaction.guildId, interaction.user.id);
  if (bal.balance < bet) {
    await interaction.reply({
      content: `You need **${bet}** coins, but you only have **${bal.balance}**.`,
      ephemeral: true,
    });
    return null;
  }
  return bal.balance;
}

async function syncGuildActivityMeta(guild) {
  try {
    const members = await guild.members.fetch({ withPresences: true });
    for (const member of members.values()) {
      if (member.user.bot) continue;
      for (const activity of member.presence?.activities ?? []) {
        const meta = await activityMetaFromDiscordActivity(activity);
        if (!meta || (!meta.image_url && !meta.application_id)) continue;
        await DB.upsertActivityMeta({
          guild_id: guild.id,
          activity_name: meta.activity_name,
          image_url: meta.image_url,
          application_id: meta.application_id,
        });
      }
    }
  } catch (err) {
    console.warn(
      `[activity-meta] sync failed for ${guild.name}:`,
      err?.message ?? err
    );
  }
}

async function creditActivityBetween({
  guildId,
  userId,
  activityName,
  startMs,
  endMs,
  timeZone = TIME_ZONE,
}) {
  if (!startMs || !endMs || endMs <= startMs || !activityName) return;

  let cursor = startMs;
  while (cursor < endMs) {
    const dayStart = startOfDayMsInTz(cursor, timeZone);
    const nextDayStart = dayStart + 24 * 60 * 60 * 1000;
    const sliceEnd = Math.min(endMs, nextDayStart);
    const seconds = Math.floor((sliceEnd - cursor) / 1000);
    if (seconds > 0) {
      const day = dayString(cursor, timeZone);
      await DB.addActivitySeconds({
        guild_id: guildId,
        user_id: userId,
        activity_name: activityName,
        seconds,
        day,
      });
    }
    cursor = sliceEnd;
  }
}

async function updateActivitySession({ guildId, userId, nextActivityName, nowMs }) {
  const settings = await getGuildSettings(guildId);
  const timeZone = settings.timezone ?? TIME_ZONE;
  const current = await DB.getActivitySession(guildId, userId);

  if (current?.started_at_ms && current?.activity_name) {
    await creditActivityBetween({
      guildId,
      userId,
      activityName: current.activity_name,
      startMs: current.started_at_ms,
      endMs: nowMs,
      timeZone,
    });
  }

  if (!nextActivityName) {
    await DB.deleteActivitySession(guildId, userId);
    return;
  }

  await DB.upsertActivitySession({
    guild_id: guildId,
    user_id: userId,
    activity_name: nextActivityName,
    started_at_ms: nowMs,
  });
}

async function creditVoiceBetween({
  guildId,
  userId,
  channelId,
  startMs,
  endMs,
}) {
  if (!startMs || !endMs || endMs <= startMs) return;

  let cursor = startMs;
  while (cursor < endMs) {
    const dayStart = startOfDayMsInTz(cursor);
    const nextDayStart = dayStart + 24 * 60 * 60 * 1000;
    const sliceEnd = Math.min(endMs, nextDayStart);

    const seconds = Math.floor((sliceEnd - cursor) / 1000);
    if (seconds > 0) {
      const day = dayString(cursor);
      await DB.addUserVoice({
        guild_id: guildId,
        user_id: userId,
        day,
        voice_seconds: seconds,
      });

      await DB.addChannelVoice({
        guild_id: guildId,
        channel_id: channelId,
        day,
        voice_seconds: seconds,
      });
    }

    cursor = sliceEnd;
  }
}

async function closeSession(guildId, userId) {
  const sess = await DB.getSession(guildId, userId);
  if (!sess) return;

  const endMs = Date.now();
  await DB.deleteSession(guildId, userId);

  await creditVoiceBetween({
    guildId,
    userId,
    channelId: sess.channel_id,
    startMs: sess.started_at_ms,
    endMs,
  });
}

async function rolloverLongVoiceSessions() {
  try {
    const now = Date.now();
    const today = dayString(now);
    const todayStart = startOfDayMsInTz(now);

    for (const guild of client.guilds.cache.values()) {
      const sessions = await DB.listSessionsForGuild(guild.id);
      for (const sess of sessions) {
        const sessDay = dayString(sess.started_at_ms);
        if (sessDay === today) continue;

        // Credit everything up through the start of "today", then keep the session open
        // with a new started_at_ms so ongoing time continues counting.
        await creditVoiceBetween({
          guildId: sess.guild_id,
          userId: sess.user_id,
          channelId: sess.channel_id,
          startMs: sess.started_at_ms,
          endMs: todayStart,
        });

        await DB.upsertSession({
          guild_id: sess.guild_id,
          user_id: sess.user_id,
          channel_id: sess.channel_id,
          started_at_ms: todayStart,
        });
      }
    }
  } catch (err) {
    console.error("rolloverLongVoiceSessions error:", err);
  }
}

function weekdayShortInTz(ms, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(
    new Date(ms)
  ); // e.g. "Mon"
}

function yearNumberInTz(ms, timeZone = TIME_ZONE) {
  const y = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(
    new Date(ms)
  );
  return Number(y);
}

async function sendRecapForGuild(guild, settings, { kind, startMs, endMs }) {
  const channelId = settings.channels.recap;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const guildId = guild.id;
  const tz = settings.timezone ?? TIME_ZONE;
  const startDay = dayString(startMs, tz);
  const endInclusiveDay = dayString(endMs - 1, tz);
  const startTs = Math.floor(startMs / 1000);
  const endTs = Math.floor((endMs - 1) / 1000);

  const joins = await DB.countMemberJoinsBetween(guildId, startMs, endMs);

  const [topMsg] = await DB.topUserMessagesRange(guildId, startDay, endInclusiveDay, 1);
  const [topVoice] = await DB.topUserVoiceRange(guildId, startDay, endInclusiveDay, 1);

  const boosts = await DB.listBoostStartsBetween(guildId, startMs, endMs, 10);

  const title =
    kind === "weekly"
      ? "Weekly recap"
      : kind === "yearly"
        ? "Yearly recap"
        : "Recap";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2b2d31)
    .setTimestamp(Date.now())
    .setThumbnail(guild?.iconURL({ extension: "png", size: 256 }) ?? null)
    .addFields(
      {
        name: "Period",
        value: `<t:${startTs}:D> → <t:${endTs}:D>`,
        inline: false,
      },
      {
        name: "New members",
        value: `**${joins}** joined`,
        inline: true,
      },
      {
        name: "Top messager",
        value:
          topMsg && topMsg.messages > 0
            ? `<@${topMsg.user_id}> — **${topMsg.messages}** messages`
            : "No data",
        inline: true,
      },
      {
        name: "Top voice",
        value:
          topVoice && topVoice.voice_seconds > 0
            ? `<@${topVoice.user_id}> — **${formatHMS(topVoice.voice_seconds)}**`
            : "No data",
        inline: true,
      }
    );

  if (boosts.length > 0) {
    embed.addFields({
      name: `New boosts (${boosts.length})`,
      value: boosts.map((b) => `<@${b.user_id}>`).join(" "),
      inline: false,
    });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}

const RECAP_CHECK_MS = 30 * 60 * 1000;

async function tickRecaps() {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = await getGuildSettings(guild.id);
      if (!settings.features.recaps || !settings.channels.recap) continue;

      const tz = settings.timezone ?? TIME_ZONE;
      const recapState = settings.recap_state ?? {};

      if (weekdayShortInTz(now, tz) === "Mon") {
        const weekStart = startOfDayMsInTz(now, tz);
        const lastWeekly = recapState.last_weekly_recap_ms ?? 0;
        if (lastWeekly < weekStart) {
          await sendRecapForGuild(guild, settings, {
            kind: "weekly",
            startMs: weekStart - 7 * oneDay,
            endMs: weekStart,
          });
          await updateGuildSettings(guild.id, {
            recap_state: { ...recapState, last_weekly_recap_ms: now },
          });
        }
      }

      const monthDay = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(now));
      if (monthDay === "01-01") {
        const year = yearNumberInTz(now, tz);
        if (recapState.last_yearly_recap_year !== year) {
          const startMiddayUtc = Date.UTC(year - 1, 0, 1, 12, 0, 0, 0);
          const endMiddayUtc = Date.UTC(year, 0, 1, 12, 0, 0, 0);
          await sendRecapForGuild(guild, settings, {
            kind: "yearly",
            startMs: startOfDayMsInTz(startMiddayUtc, tz),
            endMs: startOfDayMsInTz(endMiddayUtc, tz),
          });
          await updateGuildSettings(guild.id, {
            recap_state: { ...recapState, last_yearly_recap_year: year },
          });
        }
      }
    } catch (err) {
      console.error(`recap tick guild ${guild.id}:`, err);
    }
  }
}

function scheduleRecapTicks() {
  tickRecaps().catch((err) => console.error("recap tick failed:", err));
  setInterval(() => {
    tickRecaps().catch((err) => console.error("recap tick failed:", err));
  }, RECAP_CHECK_MS);
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function flushActiveVoiceSessions() {
  // Periodically credit time for *ongoing* voice sessions so stats stay accurate
  // even if users don't disconnect for a long time (or the bot restarts).
  try {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      const sessions = await DB.listSessionsForGuild(guild.id);
      for (const sess of sessions) {
        if (!sess?.started_at_ms) continue;

        await creditVoiceBetween({
          guildId: sess.guild_id,
          userId: sess.user_id,
          channelId: sess.channel_id,
          startMs: sess.started_at_ms,
          endMs: now,
        });

        await DB.upsertSession({
          guild_id: sess.guild_id,
          user_id: sess.user_id,
          channel_id: sess.channel_id,
          started_at_ms: now,
        });
      }
    }
  } catch (err) {
    console.error("flushActiveVoiceSessions error:", err);
  }
}

/** How often ongoing VC time is written to user_daily (default 60s). */
const VOICE_FLUSH_MS = Math.max(
  30_000,
  Number(process.env.VOICE_FLUSH_MS) || 60_000
);
let voiceFlushTimeout = null;

function scheduleVoiceFlush() {
  if (voiceFlushTimeout) clearTimeout(voiceFlushTimeout);
  voiceFlushTimeout = setTimeout(async () => {
    await flushActiveVoiceSessions();
    scheduleVoiceFlush();
  }, VOICE_FLUSH_MS);
}

async function flushActiveActivitySessions() {
  try {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      const settings = await getGuildSettings(guild.id);
      const timeZone = settings.timezone ?? TIME_ZONE;
      const sessions = await DB.listActivitySessionsForGuild(guild.id);
      for (const sess of sessions) {
        if (!sess?.started_at_ms || !sess?.activity_name) continue;
        await creditActivityBetween({
          guildId: sess.guild_id,
          userId: sess.user_id,
          activityName: sess.activity_name,
          startMs: sess.started_at_ms,
          endMs: now,
          timeZone,
        });
        await DB.upsertActivitySession({
          guild_id: sess.guild_id,
          user_id: sess.user_id,
          activity_name: sess.activity_name,
          started_at_ms: now,
        });
      }
    }
  } catch (err) {
    console.error("flushActiveActivitySessions error:", err);
  }
}

const ACTIVITY_FLUSH_MIN_MS = 10 * 60_000;
const ACTIVITY_FLUSH_MAX_MS = 30 * 60_000;
let activityFlushTimeout = null;

function scheduleActivityFlush() {
  if (activityFlushTimeout) clearTimeout(activityFlushTimeout);
  const delay = randomIntInclusive(ACTIVITY_FLUSH_MIN_MS, ACTIVITY_FLUSH_MAX_MS);
  activityFlushTimeout = setTimeout(async () => {
    await flushActiveActivitySessions();
    scheduleActivityFlush();
  }, delay);
}

// ---------------- INTERACTIONS ----------------

client.on("interactionCreate", (interaction) => {
  logInteractionReceived(interaction);
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "stats") {
        if (process.env.STATS_DEBUG === "1") {
          await safeDeferReply(interaction, "stats-debug");
          await interaction.editReply({
            content:
              "Stats debug OK — this bot received the interaction. Turn off STATS_DEBUG and redeploy.",
          });
          return;
        }

        if (!interaction.deferred && !interaction.replied) {
          await safeDeferReply(interaction, "stats");
        }
        await handleStats(interaction, { alreadyDeferred: true });
        return;
      }

      if (interaction.commandName === "help") {
        const embed = new EmbedBuilder()
          .setTitle("Bot Commands")
          .setColor(0x2b2d31)
          .setDescription(
            [
              "`/help` - Show this command list.",
              "`/stats` - View server/user activity stats.",
              "`/avatar` - Show a user's global or guild avatar.",
              "`/info` - Show detailed info and activity totals for a user.",
              "`/activities` - Top tracked activities (10 per page, use buttons).",
              "`/guildinfo` - Show info and stats for this server.",
              "`/balance` - Check your coin balance.",
              "`/daily` - Claim your daily coin reward.",
              "`/coinflip` - Bet coins on heads or tails.",
              "`/dice` - Bet coins by guessing a 1-6 roll.",
              "`/highlow` - Bet if the next card is higher or lower.",
              "`/ban` - Ban a member (requires Ban Members).",
              "`Quote` (message command) - Post a quote image from a message.",
            ].join("\n")
          );

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "avatar") {
        const user = interaction.options.getUser("user", true);
        const type = interaction.options.getString("type") ?? "global";

        let url;
        // Back-compat: treat older "server" as "guild"
        if (type === "guild" || type === "server") {
          if (!interaction.guild) {
            url = user.displayAvatarURL({ extension: "png", size: 1024 });
          } else {
          const member = await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);
          url =
            member?.avatarURL({ extension: "png", size: 1024 }) ??
            user.displayAvatarURL({ extension: "png", size: 1024 });
          }
        } else {
          url = user.displayAvatarURL({ extension: "png", size: 1024 });
        }

        const embed = new EmbedBuilder()
          .setAuthor({ name: `${user.username}`, iconURL: url })
          .setTitle(type === "guild" || type === "server" ? "Guild avatar" : "Global avatar")
          .setURL(url)
          .setImage(url)
          .setColor(0x2b2d31);

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === "info") {
        await interaction.deferReply();

        const settings = await getGuildSettings(interaction.guildId);
        const user = interaction.options.getUser("user", true);
        const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });

        const minDay = await getMinVisibleDay(interaction.guildId, settings.timezone);
        const totals = minDay
          ? await DB.sumUserAllTimeSince(interaction.guildId, user.id, minDay)
          : await DB.sumUserAllTime(interaction.guildId, user.id);
        const topActivities = await DB.topActivitiesForUser(
          interaction.guildId,
          user.id,
          3,
          minDay
        );
        const premium = await isPremiumGuild(interaction.guildId);

        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

        const boosting = Boolean(member?.premiumSince);

        const createdAt = user.createdTimestamp
          ? formatDiscordTs(user.createdTimestamp)
          : "Unknown";
        const joinedAt =
          member?.joinedTimestamp != null
            ? formatDiscordTs(member.joinedTimestamp)
            : "Not in server";

        const roleList = (() => {
          if (!member) return "Not in server";
          const guildId = member.guild?.id;
          const roles = member.roles?.cache;
          if (!roles || !guildId) return "Unknown";

          const sorted = roles
            .filter((r) => r.id !== guildId)
            .sort((a, b) => b.comparePositionTo(a));

          if (sorted.size === 0) return "None";

          const rendered = sorted.map((r) => `${r}`).join(" ");
          if (rendered.length <= 1024) return rendered;

          // Truncate to embed field limit; keep it readable.
          let out = "";
          let count = 0;
          for (const r of sorted.values()) {
            const next = (out ? " " : "") + `${r}`;
            if ((out + next).length > 1000) break;
            out += next;
            count++;
          }
          const remaining = sorted.size - count;
          return `${out}\n… +${remaining} more`;
        })();

        const topActivitiesText =
          topActivities.length === 0
            ? "No tracked activity yet."
            : topActivities
                .map((a, i) => `${i + 1}. **${a.activity_name}** - ${formatHMS(a.total_seconds)}`)
                .join("\n");

        const embed = new EmbedBuilder()
          .setAuthor({ name: `${user.tag}`, iconURL: avatarUrl })
          .setThumbnail(avatarUrl)
          .setTitle("User info")
          .setColor(0x2b2d31);

        const infoFields = [
          {
            name: "Total chat messages",
            value: `${totals.messages}`,
            inline: true,
          },
          {
            name: "Total VC time",
            value: formatHMS(totals.voice_seconds),
            inline: true,
          },
        ];

        if (boosting) {
          infoFields.push({
            name: "Boosting",
            value: `Yes (since ${formatDiscordTs(member.premiumSinceTimestamp)})`,
            inline: false,
          });
        }

        infoFields.push(
          { name: "Joined server", value: joinedAt, inline: false },
          { name: "Account created", value: createdAt, inline: false },
          {
            name: "Roles",
            value: roleList,
            inline: false,
          },
          {
            name: "Top activities",
            value: topActivitiesText,
            inline: false,
          }
        );

        embed.addFields(infoFields);
        if (!premium) {
          embed.setFooter({ text: `Free plan: stats from the last 90 days` });
          embed.setDescription(premiumUpsellNote());
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === "activities") {
        await handleActivities(interaction);
        return;
      }

      if (interaction.commandName === "guildinfo") {
        await interaction.deferReply();

        const settings = await getGuildSettings(interaction.guildId);
        const guild = interaction.guild;
        const minDay = await getMinVisibleDay(interaction.guildId, settings.timezone);
        const totals = minDay
          ? await DB.sumGuildAllTimeSince(interaction.guildId, minDay)
          : await DB.sumGuildAllTime(interaction.guildId);
        const premium = await isPremiumGuild(interaction.guildId);

        const boosters =
          typeof guild.premiumSubscriptionCount === "number"
            ? guild.premiumSubscriptionCount
            : "Unknown";

        const createdAt =
          guild.createdTimestamp != null
            ? formatDiscordTs(guild.createdTimestamp)
            : "Unknown";

        const embed = new EmbedBuilder()
          .setTitle("Server info")
          .setColor(0x2b2d31)
          .setThumbnail(guild.iconURL({ extension: "png", size: 256 }) ?? null)
          .addFields(
            { name: "Members", value: `${guild.memberCount ?? "Unknown"}`, inline: true },
            { name: "Boosters", value: `${boosters}`, inline: true },
            { name: "Server created", value: createdAt, inline: false },
            { name: "Total messages", value: `${totals.messages}`, inline: true },
            { name: "Total VC time", value: formatHMS(totals.voice_seconds), inline: true }
          );

        if (!premium) {
          embed.setFooter({ text: "Free plan: stats from the last 90 days" });
          embed.setDescription(premiumUpsellNote());
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === "balance") {
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings.features.economy) {
          await interaction.reply({ content: FEATURE_DISABLED, ephemeral: true });
          return;
        }
        const targetUser = interaction.options.getUser("user") ?? interaction.user;
        const bal = await DB.getBalance(interaction.guildId, targetUser.id);
        await interaction.reply({
          content: `${targetUser} has **${bal.balance}** coins • Daily streak: **${bal.daily_streak}**`,
        });
        return;
      }

      if (interaction.commandName === "daily") {
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings.features.economy) {
          await interaction.reply({ content: FEATURE_DISABLED, ephemeral: true });
          return;
        }

        const tz = settings.timezone ?? TIME_ZONE;
        const now = Date.now();
        const today = dayString(now, tz);
        const bal = await DB.getBalance(interaction.guildId, interaction.user.id);
        const lastMs = bal.last_daily_claim_ms;

        if (lastMs != null && dayString(lastMs, tz) === today) {
          const nextMs = startOfNextCalendarDayMsInTz(now, tz);
          const next = Math.floor(nextMs / 1000);
          await interaction.reply({
            content: `You already claimed today. Next claim: <t:${next}:R>.`,
            ephemeral: true,
          });
          return;
        }

        const yesterdayStr = dayString(startOfDayMsInTz(now, tz) - 1, tz);
        let newStreak;
        if (lastMs == null) {
          newStreak = 1;
        } else if (dayString(lastMs, tz) === yesterdayStr) {
          newStreak = bal.daily_streak + 1;
        } else {
          newStreak = 1;
        }

        const reward = dailyRewardForStreak(newStreak, settings.economy);
        const rewardBase = settings.economy?.daily_reward_base ?? DEFAULT_DAILY_REWARD_BASE;
        const res = await DB.applyDailyClaim(
          interaction.guildId,
          interaction.user.id,
          now,
          reward,
          newStreak
        );

        const bonus = reward - rewardBase;
        const bonusLine =
          bonus > 0
            ? ` (includes **+${bonus}** streak bonus)`
            : "";

        await interaction.reply({
          content:
            `**Day ${res.streak}** streak — you claimed **${res.reward}** coins${bonusLine}.\n` +
            `New balance: **${res.balance}**.`,
        });
        return;
      }

      if (interaction.commandName === "coinflip") {
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings.features.economy) {
          await interaction.reply({ content: FEATURE_DISABLED, ephemeral: true });
          return;
        }

        const bet = interaction.options.getInteger("bet", true);
        const side = interaction.options.getString("side", true);
        if ((await ensureBettable(interaction, bet)) == null) return;

        const ok = await DB.trySubtractBalance(interaction.guildId, interaction.user.id, bet);
        if (!ok) {
          await interaction.reply({ content: "Bet failed. Try again.", ephemeral: true });
          return;
        }

        const result = Math.random() < 0.5 ? "heads" : "tails";
        if (result === side) {
          const updated = await DB.addBalance(interaction.guildId, interaction.user.id, bet * 2);
          await interaction.reply({
            content:
              `Coin landed **${result}**. You won **${bet}** coins.\n` +
              `Balance: **${updated.balance}**`,
          });
          return;
        }

        const updated = await DB.getBalance(interaction.guildId, interaction.user.id);
        await interaction.reply({
          content:
            `Coin landed **${result}**. You lost **${bet}** coins.\n` +
            `Balance: **${updated.balance}**`,
        });
        return;
      }

      if (interaction.commandName === "dice") {
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings.features.economy) {
          await interaction.reply({ content: FEATURE_DISABLED, ephemeral: true });
          return;
        }

        const bet = interaction.options.getInteger("bet", true);
        const guess = interaction.options.getInteger("guess", true);
        if ((await ensureBettable(interaction, bet)) == null) return;

        const ok = await DB.trySubtractBalance(interaction.guildId, interaction.user.id, bet);
        if (!ok) {
          await interaction.reply({ content: "Bet failed. Try again.", ephemeral: true });
          return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        const rolledDie = maybeDiceAttachment(roll, "dice-roll");
        const resultEmbed = new EmbedBuilder()
          .setTitle("Dice")
          .setColor(0x2b2d31)
          .setDescription(`You guessed **${guess}**, rolled **${roll}**.`);
        if (rolledDie) resultEmbed.setImage(rolledDie.url);

        if (roll === guess) {
          const updated = await DB.addBalance(interaction.guildId, interaction.user.id, bet * 6);
          resultEmbed.addFields(
            { name: "Outcome", value: `Big win: **+${bet * 5}** net.` },
            { name: "Balance", value: `**${updated.balance}**` }
          );
          await interaction.reply({
            embeds: [resultEmbed],
            files: rolledDie ? [rolledDie.file] : [],
          });
          return;
        }

        const updated = await DB.getBalance(interaction.guildId, interaction.user.id);
        resultEmbed.addFields(
          { name: "Outcome", value: `You lost **${bet}**.` },
          { name: "Balance", value: `**${updated.balance}**` }
        );
        await interaction.reply({
          embeds: [resultEmbed],
          files: rolledDie ? [rolledDie.file] : [],
        });
        return;
      }

      if (interaction.commandName === "highlow") {
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings.features.economy) {
          await interaction.reply({ content: FEATURE_DISABLED, ephemeral: true });
          return;
        }

        const bet = interaction.options.getInteger("bet", true);
        if ((await ensureBettable(interaction, bet)) == null) return;

        const ok = await DB.trySubtractBalance(interaction.guildId, interaction.user.id, bet);
        if (!ok) {
          await interaction.reply({ content: "Bet failed. Try again.", ephemeral: true });
          return;
        }

        const first = Math.floor(Math.random() * 13) + 2; // 2..14
        const gameId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        highlowGames.set(gameId, {
          userId: interaction.user.id,
          guildId: interaction.guildId,
          bet,
          first,
          expiresAt: Date.now() + HIGHLOW_GAME_TTL_MS,
        });

        const firstCard = maybeCardAttachment(first, "highlow-first");
        const embed = new EmbedBuilder()
          .setTitle("High/Low")
          .setColor(0x2b2d31)
          .setDescription(
            [
              `Bet: **${bet}** coins`,
              `First card: **${cardLabel(first)}**`,
              "Pick **Higher** or **Lower** using the buttons below.",
            ].join("\n")
          );

        if (firstCard) embed.setImage(firstCard.url);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`highlow:${gameId}:higher`)
            .setLabel("Higher")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`highlow:${gameId}:lower`)
            .setLabel("Lower")
            .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
          embeds: [embed],
          components: [row],
          files: firstCard ? [firstCard.file] : [],
        });
        return;
      }

      if (interaction.commandName === "ban") {
        const settings = await getGuildSettings(interaction.guildId);
        await handleBan(interaction, settings);
        return;
      }
    }

    // stats buttons
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("highlow:")) {
        const [, gameId, pick] = interaction.customId.split(":");
        const game = highlowGames.get(gameId);

        if (!game) {
          await interaction.reply({
            content: "This high/low round is no longer active.",
            ephemeral: true,
          });
          return;
        }

        if (interaction.user.id !== game.userId) {
          await interaction.reply({
            content: "Only the player who started this round can choose.",
            ephemeral: true,
          });
          return;
        }

        highlowGames.delete(gameId);

        if (Date.now() > game.expiresAt) {
          const expiredEmbed = new EmbedBuilder()
            .setTitle("High/Low")
            .setColor(0x2b2d31)
            .setDescription("Round expired. Your bet was returned.");
          const refunded = await DB.addBalance(game.guildId, game.userId, game.bet);
          expiredEmbed.addFields({
            name: "Balance",
            value: `**${refunded.balance}**`,
          });

          await interaction.update({
            embeds: [expiredEmbed],
            components: [],
          });
          return;
        }

        const second = Math.floor(Math.random() * 13) + 2;
        const secondCard = maybeCardAttachment(second, "highlow-second");
        const resultEmbed = new EmbedBuilder()
          .setTitle("High/Low Result")
          .setColor(0x2b2d31)
          .setDescription(
            `First: **${cardLabel(game.first)}** | Next: **${cardLabel(second)}**`
          );
        if (secondCard) resultEmbed.setImage(secondCard.url);

        if (second === game.first) {
          const updated = await DB.addBalance(game.guildId, game.userId, game.bet);
          resultEmbed.addFields(
            { name: "Outcome", value: "Tie -> push (bet returned)." },
            { name: "Balance", value: `**${updated.balance}**` }
          );
          await interaction.update({
            embeds: [resultEmbed],
            components: [],
            files: secondCard ? [secondCard.file] : [],
          });
          return;
        }

        const won = pick === "higher" ? second > game.first : second < game.first;
        if (won) {
          const updated = await DB.addBalance(game.guildId, game.userId, game.bet * 2);
          resultEmbed.addFields(
            { name: "Outcome", value: `You won **${game.bet}** coins.` },
            { name: "Balance", value: `**${updated.balance}**` }
          );
          await interaction.update({
            embeds: [resultEmbed],
            components: [],
            files: secondCard ? [secondCard.file] : [],
          });
          return;
        }

        const updated = await DB.getBalance(game.guildId, game.userId);
        resultEmbed.addFields(
          { name: "Outcome", value: `You lost **${game.bet}** coins.` },
          { name: "Balance", value: `**${updated.balance}**` }
        );
        await interaction.update({
          embeds: [resultEmbed],
          components: [],
          files: secondCard ? [secondCard.file] : [],
        });
        return;
      }

      if (interaction.customId.startsWith("stats:period:")) {
        if (!interaction.deferred && !interaction.replied) {
          await safeDeferUpdate(interaction, "stats-period");
        }
        await handleStatsPeriodButton(interaction, { alreadyDeferred: true });
        return;
      }

      if (interaction.customId.startsWith("activities:page:")) {
        await handleActivitiesPageButton(interaction);
        return;
      }
    }

    // Quote (message context menu)
    if (interaction.isMessageContextMenuCommand()) {
      if (interaction.commandName === "Quote") {
        await interaction.deferReply({ ephemeral: true });

        const settings = await getGuildSettings(interaction.guildId);
        if (!settings.features.quotes) {
          await interaction.editReply({ content: FEATURE_DISABLED });
          return;
        }

        const quoteChannelId = settings.channels.quote;
        if (!quoteChannelId) {
          await interaction.editReply({
            content:
              "Quote channel is not configured. Set it in the web dashboard.",
          });
          return;
        }

        const message = interaction.targetMessage;

        const buffer = await renderQuoteImage({
          message,
          guild: interaction.guild,
        });

        const quoteChannel = await interaction.guild.channels
          .fetch(quoteChannelId)
          .catch(() => null);

        if (!quoteChannel?.isTextBased()) {
          await interaction.editReply({
            content: "Quote channel not found or not a text channel.",
          });
          return;
        }

        await quoteChannel.send({
          files: [{ attachment: buffer, name: "quote.png" }],
        });

        // Quiet confirmation to the person who used the command
        await interaction.editReply({ content: "Posted quote." });

        return;
      }
    }
  } catch (err) {
    if (err?.code === 10062 || err?.code === 10008) return;

    console.error("interactionCreate error:", err);
    if (!interaction.isRepliable()) return;

    const payload = { content: "An error occurred.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (newMember.user?.bot) return;

    let oldPremiumSince = oldMember.premiumSinceTimestamp;
    if (oldMember.partial) {
      try {
        const fetched = await oldMember.fetch(true);
        oldPremiumSince = fetched.premiumSinceTimestamp;
      } catch {
        oldPremiumSince = null;
      }
    }

    const newPremiumSince = newMember.premiumSinceTimestamp;

    if (!oldPremiumSince && newPremiumSince) {
      await recordBoostStart(newMember.guild.id, newMember.id, newPremiumSince);
      console.log(
        `[boost] guildMemberUpdate ${newMember.user?.username ?? newMember.id}`
      );
    }

    if (oldPremiumSince && !newPremiumSince) {
      await shameBoosterDrop(newMember);
    }
  } catch (err) {
    console.error("guildMemberUpdate error:", err);
  }
});

client.on("guildMemberAdd", async (member) => {
  try {
    const when = member.joinedTimestamp ?? Date.now();
    await DB.logMemberJoin(member.guild.id, member.id, when);
  } catch (err) {
    console.error("guildMemberAdd error:", err);
  }
});

client.on("guildCreate", async (guild) => {
  try {
    await ensureGuildSettings(guild.id);
    await syncGuildActivityMeta(guild);
    console.log(`Joined guild ${guild.name} (${guild.id}) — default settings created`);
  } catch (err) {
    console.error("guildCreate error:", err);
  }
});

// ---------------- STARTUP ----------------

client.once(Events.ClientReady, async () => {
  const appId = client.application?.id;
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Bot application ID: ${appId}`);

  if (clientId && appId !== clientId) {
    console.warn(
      `CLIENT_ID in env (${clientId}) does not match this bot (${appId}). ` +
        `Set CLIENT_ID=${appId} on the panel (optional).`
    );
  }

  const guildList = [...client.guilds.cache.values()]
    .map((g) => `${g.name} (${g.id})`)
    .join(", ");
  console.log(
    guildList
      ? `Bot is in: ${guildList}`
      : "Bot is not in any servers — invite it first (see README)."
  );

  if (guildId && !client.guilds.cache.has(guildId)) {
    console.warn(
      `Invite this bot to GUILD_ID=${guildId} or change GUILD_ID to one of the servers above:\n` +
        `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=8`
    );
  }

  try {
    await registerCommands(appId, client);
  } catch (err) {
    console.error("Command registration failed:", err?.message ?? err);
  }

  for (const guild of client.guilds.cache.values()) {
    await syncGuildActivityMeta(guild);
  }

  try {
    if (guildId) {
      const g = client.guilds.cache.get(guildId);
      if (g) {
        await g.members.fetch().catch((err) => {
          console.warn(
            "[boost] member cache prefetch failed (enable Server Members intent):",
            err?.message ?? err
          );
        });
      }
    }
  } catch (err) {
    console.warn("[boost] startup member prefetch:", err?.message ?? err);
  }

  try {
    await DB.init();
    console.log(`MongoDB: ${mongoConnectionLabel()} (all bot data writes here)`);
    if (guildId) {
      await DB.sumGuildAllTime(guildId).catch(() => {});
    }
  } catch (err) {
    console.error("MongoDB init failed:", err?.message ?? err);
  }
  console.log(
    "Boost logging: guildMemberUpdate + boost system messages (needs Server Members intent)"
  );
  console.log(`Voice stats flush every ${VOICE_FLUSH_MS / 1000}s (set VOICE_FLUSH_MS to change)`);
  flushActiveVoiceSessions().catch((err) =>
    console.error("Initial voice flush failed:", err?.message ?? err)
  );
  scheduleVoiceFlush();
  scheduleActivityFlush();
  for (const guild of client.guilds.cache.values()) {
    await ensureGuildSettings(guild.id).catch(() => {});
  }
  scheduleRecapTicks();
});

await client.login(token);

// Rollover voice sessions that span TIME_ZONE midnights (prevents >24h sessions from "missing a day").
setInterval(rolloverLongVoiceSessions, 60_000);
