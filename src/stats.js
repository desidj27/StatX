import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { DB } from "./db.js";
import { safeDeferUpdate } from "./interaction-utils.js";
import {
  resolveRange,
  ensureSeriesDays,
  formatHMS,
  todayInTz,
  downsampleSeriesForChart,
} from "./periods.js";
import { getGuildSettings } from "./guild-settings.js";
import { applyPlanToRange, isPremiumGuild, premiumUpsellNote } from "./plan.js";

async function finalizeStatsRange({ guildId, mode, targetId, range }) {
  const settings = await getGuildSettings(guildId);
  let next = range;
  if (range.label === "All time" || range.label?.startsWith("All time")) {
    next = await maybeClampAllRangeStart({ guildId, mode, targetId, range });
  }
  return applyPlanToRange(guildId, next, settings.timezone);
}

async function maybeClampAllRangeStart({ guildId, mode, targetId, range }) {
  if (range.label !== "All time") return range;

  const firstDay =
    mode === "user"
      ? await DB.firstUserDay(guildId, targetId)
      : await DB.firstChannelDay(guildId, targetId);

  if (!firstDay) {
    const today = todayInTz();
    return {
      start: today,
      end: today,
      label: "All time (no activity yet)",
    };
  }
  if (firstDay > range.end) return range;

  return { ...range, start: firstDay, label: `All time (since ${firstDay})` };
}

const PERIODS = ["3d", "7d", "30d", "90d", "all"];

/** Pending VC seconds (uses DB helpers when present, else voice_sessions). */
async function getLiveUserVoiceSeconds(guildId, userId) {
  if (typeof DB.ongoingUserVoiceSeconds === "function") {
    return DB.ongoingUserVoiceSeconds(guildId, userId);
  }
  const sess = await DB.getSession(guildId, userId);
  if (!sess?.started_at_ms) return 0;
  return Math.max(0, Math.floor((Date.now() - sess.started_at_ms) / 1000));
}

async function getLiveChannelVoiceSeconds(guildId, channelId) {
  if (typeof DB.ongoingChannelVoiceSeconds === "function") {
    return DB.ongoingChannelVoiceSeconds(guildId, channelId);
  }
  const sessions = await DB.listSessionsForGuild(guildId);
  const now = Date.now();
  let total = 0;
  for (const sess of sessions) {
    if (sess.channel_id !== channelId || !sess.started_at_ms) continue;
    total += Math.max(0, Math.floor((now - sess.started_at_ms) / 1000));
  }
  return total;
}

/** Add not-yet-flushed VC time so /stats updates while user is still in voice. */
async function applyLiveVoice({ guildId, range, totals, series, liveSeconds }) {
  if (!liveSeconds || liveSeconds <= 0) return { totals, series };

  const today = todayInTz();
  if (today < range.start || today > range.end) return { totals, series };

  return {
    totals: {
      ...totals,
      voice_seconds: Number(totals.voice_seconds ?? 0) + liveSeconds,
    },
    series: series.map((r) =>
      r.day === today
        ? { ...r, voice_seconds: Number(r.voice_seconds ?? 0) + liveSeconds }
        : r
    ),
  };
}

const EPHEMERAL = { flags: MessageFlags.Ephemeral };
const DB_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 12_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

async function buildStatsAttachment(cardOpts) {
  if (process.env.SKIP_STATS_CHART === "1") return [];

  try {
    const { renderStatsCard } = await import("./render_stats.js");
    const png = await withTimeout(
      renderStatsCard({
        ...cardOpts,
        series: downsampleSeriesForChart(cardOpts.series),
      }),
      RENDER_TIMEOUT_MS,
      "Chart render"
    );
    return [new AttachmentBuilder(png, { name: "stats.png" })];
  } catch (err) {
    console.error("Stats chart skipped:", err?.message ?? err);
    return [];
  }
}

/** Text first, then chart on next tick so period buttons can still defer. */
async function replyWithStatsChart(interaction, { content, components, cardOpts }) {
  await safeEditReply(interaction, { content, files: [], components });
  if (process.env.SKIP_STATS_CHART === "1") return;

  setImmediate(async () => {
    try {
      const files = await buildStatsAttachment(cardOpts);
      if (files.length > 0) {
        await safeEditReply(interaction, { content, files, components });
      }
    } catch (err) {
      console.error("Deferred stats chart failed:", err?.message ?? err);
    }
  });
}

function isUnknownInteraction(err) {
  return err?.code === 10062 || err?.code === 10008;
}

function statsContentLine(totals, rangeLabel, { showUpsell = false } = {}) {
  const line = `Messages: **${totals.messages}** • Voice: **${formatHMS(totals.voice_seconds)}** • ${rangeLabel}`;
  return showUpsell ? `${line}\n${premiumUpsellNote()}` : line;
}

async function statsUpsellFlag(guildId, rangeLabel) {
  if (await isPremiumGuild(guildId)) return false;
  return (
    rangeLabel.includes("upgrade") ||
    rangeLabel.includes("free plan") ||
    rangeLabel.startsWith("Last 90 days")
  );
}

async function replyStatsError(interaction, err) {
  if (isUnknownInteraction(err)) return;

  console.error("handleStats error:", err);
  const hint =
    err?.message?.includes("timed out") ||
    err?.message?.includes("MongoDB") ||
    err?.message?.includes("SSL")
      ? "Could not reach MongoDB. On your panel, set `MONGODB_URI` and allow `0.0.0.0/0` in Atlas → Network Access."
      : err?.message || "Unknown error";
  const payload = {
    content: `Stats failed: ${hint}`,
    files: [],
    components: [],
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply({ content: payload.content, ...EPHEMERAL }).catch(() => {});
  }
}

async function safeEditReply(interaction, options) {
  await interaction.editReply(options).catch((err) => {
    if (err?.code === 10008 || err?.code === 10062) return;
    throw err;
  });
}

function buildPeriodButtons({ mode, targetId, activePeriod }) {
  // customId format:
  // stats:period:<mode>:<targetId>:<period>
  // mode = "user" | "channel"
  const row = new ActionRowBuilder();

  for (const p of PERIODS) {
    const label =
      p === "all" ? "All" : p.toUpperCase(); // 3D, 7D, 30D, 90D, All

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`stats:period:${mode}:${targetId}:${p}`)
        .setLabel(label)
        .setStyle(p === activePeriod ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(p === activePeriod)
    );
  }

  return [row];
}

export const statsCommand = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Show user or channel activity stats with a chart.")
  .addSubcommand((sub) =>
    sub
      .setName("user")
      .setDescription("User stats (messages + voice time).")
      .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("period")
          .setDescription("3d, 7d, 30d, 90d, all, or custom")
          .setRequired(false)
          .addChoices(
            { name: "3d", value: "3d" },
            { name: "7d", value: "7d" },
            { name: "30d", value: "30d" },
            { name: "90d", value: "90d" },
            { name: "All time", value: "all" },
            { name: "Custom (use from/to)", value: "custom" }
          )
      )
      .addStringOption((o) => o.setName("from").setDescription("YYYY-MM-DD (custom only)").setRequired(false))
      .addStringOption((o) => o.setName("to").setDescription("YYYY-MM-DD (custom only)").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName("channel")
      .setDescription("Channel stats (messages + voice time).")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Text/voice channel")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
      )
      .addStringOption((o) =>
        o
          .setName("period")
          .setDescription("3d, 7d, 30d, 90d, all, or custom")
          .setRequired(false)
          .addChoices(
            { name: "3d", value: "3d" },
            { name: "7d", value: "7d" },
            { name: "30d", value: "30d" },
            { name: "90d", value: "90d" },
            { name: "All time", value: "all" },
            { name: "Custom (use from/to)", value: "custom" }
          )
      )
      .addStringOption((o) => o.setName("from").setDescription("YYYY-MM-DD (custom only)").setRequired(false))
      .addStringOption((o) => o.setName("to").setDescription("YYYY-MM-DD (custom only)").setRequired(false))
  );

export async function handleStats(interaction, { alreadyDeferred = false } = {}) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Use this command in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const periodOpt = interaction.options.getString("period") ?? "30d";
  const from = interaction.options.getString("from");
  const to = interaction.options.getString("to");

  if (periodOpt === "custom" && (!from || !to)) {
    await interaction.reply({
      content: "For custom range, provide both `from` and `to` as YYYY-MM-DD.",
      ...EPHEMERAL,
    });
    return;
  }

  try {
    if (!alreadyDeferred && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const guildSettings = await getGuildSettings(guildId);
    const range = resolveRange({
      period: periodOpt === "custom" ? undefined : periodOpt,
      from: periodOpt === "custom" ? from : undefined,
      to: periodOpt === "custom" ? to : undefined,
      timeZone: guildSettings.timezone,
    });
    const activePeriod = PERIODS.includes(periodOpt) ? periodOpt : "30d";

    if (sub === "user") {
      const user = interaction.options.getUser("user", true);

      const clampedRange = await withTimeout(
        finalizeStatsRange({
          guildId,
          mode: "user",
          targetId: user.id,
          range,
        }),
        DB_TIMEOUT_MS,
        "Stats range"
      );

      let totals = await withTimeout(
        DB.sumUserRange(guildId, user.id, clampedRange.start, clampedRange.end),
        DB_TIMEOUT_MS,
        "Stats totals"
      );
      const rawSeries = await withTimeout(
        DB.seriesUserRange(guildId, user.id, clampedRange.start, clampedRange.end),
        DB_TIMEOUT_MS,
        "Stats series"
      );
      let series = ensureSeriesDays(rawSeries, clampedRange.start, clampedRange.end);
      const liveVoice = await getLiveUserVoiceSeconds(guildId, user.id);
      ({ totals, series } = await applyLiveVoice({
        guildId,
        range: clampedRange,
        totals,
        series,
        liveSeconds: liveVoice,
      }));

      const components =
        periodOpt === "custom"
          ? []
          : buildPeriodButtons({ mode: "user", targetId: user.id, activePeriod });

      const content = statsContentLine(totals, clampedRange.label, {
        showUpsell: await statsUpsellFlag(guildId, clampedRange.label),
      });
      const cardOpts = {
        avatarUrl: user.displayAvatarURL({ extension: "png", size: 128 }),
        title: `${user.username}`,
        subtitle: "User activity",
        rangeLabel: clampedRange.label,
        totals,
        series,
      };

      await replyWithStatsChart(interaction, { content, components, cardOpts });
      return;
    }

    if (sub === "channel") {
      const channel = interaction.options.getChannel("channel", true);

      const clampedRange = await withTimeout(
        finalizeStatsRange({
          guildId,
          mode: "channel",
          targetId: channel.id,
          range,
        }),
        DB_TIMEOUT_MS,
        "Stats range"
      );

      let totals = await withTimeout(
        DB.sumChannelRange(
          guildId,
          channel.id,
          clampedRange.start,
          clampedRange.end
        ),
        DB_TIMEOUT_MS,
        "Stats totals"
      );
      const rawSeries = await withTimeout(
        DB.seriesChannelRange(
          guildId,
          channel.id,
          clampedRange.start,
          clampedRange.end
        ),
        DB_TIMEOUT_MS,
        "Stats series"
      );
      let series = ensureSeriesDays(rawSeries, clampedRange.start, clampedRange.end);
      const liveVoice = await getLiveChannelVoiceSeconds(guildId, channel.id);
      ({ totals, series } = await applyLiveVoice({
        guildId,
        range: clampedRange,
        totals,
        series,
        liveSeconds: liveVoice,
      }));

      const components =
        periodOpt === "custom"
          ? []
          : buildPeriodButtons({ mode: "channel", targetId: channel.id, activePeriod });

      const content = statsContentLine(totals, clampedRange.label, {
        showUpsell: await statsUpsellFlag(guildId, clampedRange.label),
      });
      const cardOpts = {
        title: `#${channel.name ?? channel.id}`,
        subtitle: "Channel activity",
        rangeLabel: clampedRange.label,
        totals,
        series,
      };

      await replyWithStatsChart(interaction, { content, components, cardOpts });
    }
  } catch (err) {
    await replyStatsError(interaction, err);
  }
}

export async function handleStatsPeriodButton(
  interaction,
  { alreadyDeferred = false } = {}
) {
  const parts = interaction.customId.split(":");
  if (parts.length !== 5) return;

  const mode = parts[2];
  const targetId = parts[3];
  const period = parts[4];

  if (!PERIODS.includes(period)) {
    await interaction.reply({ content: "Invalid period.", ...EPHEMERAL });
    return;
  }

  const row = interaction.message?.components?.[0];
  const self = row?.components?.find((c) => c.customId === interaction.customId);
  if (self?.disabled) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    return;
  }

  try {
    if (!alreadyDeferred && !interaction.deferred && !interaction.replied) {
      await safeDeferUpdate(interaction, `stats-btn:${period}`);
    }

    const guildId = interaction.guildId;
    const guildSettings = await getGuildSettings(guildId);
    const range = resolveRange({ period, timeZone: guildSettings.timezone });

    if (mode === "user") {
    const user = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!user) {
      await safeEditReply(interaction, {
        content: "User not found.",
        components: [],
        files: [],
      });
      return;
    }

    const clampedRange = await withTimeout(
      finalizeStatsRange({
        guildId,
        mode: "user",
        targetId: user.id,
        range,
      }),
      DB_TIMEOUT_MS,
      "Stats range"
    );

    let totals = await withTimeout(
      DB.sumUserRange(guildId, user.id, clampedRange.start, clampedRange.end),
      DB_TIMEOUT_MS,
      "Stats totals"
    );
    const rawSeries = await withTimeout(
      DB.seriesUserRange(guildId, user.id, clampedRange.start, clampedRange.end),
      DB_TIMEOUT_MS,
      "Stats series"
    );
    let series = ensureSeriesDays(rawSeries, clampedRange.start, clampedRange.end);
    const liveVoice = await getLiveUserVoiceSeconds(guildId, user.id);
    ({ totals, series } = await applyLiveVoice({
      guildId,
      range: clampedRange,
      totals,
      series,
      liveSeconds: liveVoice,
    }));

    const components = buildPeriodButtons({
      mode: "user",
      targetId: user.id,
      activePeriod: period,
    });
    const content = statsContentLine(totals, clampedRange.label, {
      showUpsell: await statsUpsellFlag(guildId, clampedRange.label),
    });
    await replyWithStatsChart(interaction, {
      content,
      components,
      cardOpts: {
        avatarUrl: user.displayAvatarURL({ extension: "png", size: 128 }),
        title: `${user.username}`,
        subtitle: "User activity",
        rangeLabel: clampedRange.label,
        totals,
        series,
      },
    });

    return;
    }

    if (mode === "channel") {
    const channel = await interaction.guild.channels.fetch(targetId).catch(() => null);
    if (!channel) {
      await safeEditReply(interaction, {
        content: "Channel not found.",
        components: [],
        files: [],
      });
      return;
    }

    const clampedRange = await withTimeout(
      finalizeStatsRange({
        guildId,
        mode: "channel",
        targetId: channel.id,
        range,
      }),
      DB_TIMEOUT_MS,
      "Stats range"
    );

    let totals = await withTimeout(
      DB.sumChannelRange(
        guildId,
        channel.id,
        clampedRange.start,
        clampedRange.end
      ),
      DB_TIMEOUT_MS,
      "Stats totals"
    );
    const rawSeries = await withTimeout(
      DB.seriesChannelRange(
        guildId,
        channel.id,
        clampedRange.start,
        clampedRange.end
      ),
      DB_TIMEOUT_MS,
      "Stats series"
    );
    let series = ensureSeriesDays(rawSeries, clampedRange.start, clampedRange.end);
    const liveVoice = await getLiveChannelVoiceSeconds(guildId, channel.id);
    ({ totals, series } = await applyLiveVoice({
      guildId,
      range: clampedRange,
      totals,
      series,
      liveSeconds: liveVoice,
    }));

    const components = buildPeriodButtons({
      mode: "channel",
      targetId: channel.id,
      activePeriod: period,
    });
    const content = statsContentLine(totals, clampedRange.label, {
      showUpsell: await statsUpsellFlag(guildId, clampedRange.label),
    });
    await replyWithStatsChart(interaction, {
      content,
      components,
      cardOpts: {
        title: `#${channel.name ?? channel.id}`,
        subtitle: "Channel activity",
        rangeLabel: clampedRange.label,
        totals,
        series,
      },
    });
    }
  } catch (err) {
    await replyStatsError(interaction, err);
  }
}
