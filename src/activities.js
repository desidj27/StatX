import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { DB } from "./db.js";
import { formatHMS } from "./periods.js";
import { getGuildSettings } from "./guild-settings.js";
import { getMinVisibleDay, isPremiumGuild, premiumUpsellNote } from "./plan.js";

export const ACTIVITIES_PAGE_SIZE = 10;

export const activitiesCommand = new SlashCommandBuilder()
  .setName("activities")
  .setDescription("Show top activities and tracked time.");

function totalPages(activityCount) {
  return Math.max(1, Math.ceil(activityCount / ACTIVITIES_PAGE_SIZE));
}

function clampPage(page, activityCount) {
  const maxPage = totalPages(activityCount) - 1;
  return Math.min(Math.max(0, page), maxPage);
}

function buildActivitiesEmbed(rows, { page, activityCount }) {
  const pages = totalPages(activityCount);
  const safePage = clampPage(page, activityCount);
  const startRank = safePage * ACTIVITIES_PAGE_SIZE + 1;

  const description =
    rows.length === 0
      ? "No tracked activity yet."
      : rows
          .map(
            (r, idx) =>
              `${startRank + idx}. **${r.activity_name}** — ${formatHMS(r.total_seconds)}`
          )
          .join("\n");

  return new EmbedBuilder()
    .setTitle("Top Activities")
    .setColor(0x2b2d31)
    .setDescription(description)
    .setFooter({
      text:
        activityCount === 0
          ? "No activities tracked"
          : `Page ${safePage + 1} of ${pages} • ${activityCount} total`,
    });
}

function buildActivitiesButtons(page, activityCount) {
  const pages = totalPages(activityCount);
  if (pages <= 1) return [];

  const safePage = clampPage(page, activityCount);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`activities:page:${safePage - 1}`)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`activities:page:${safePage + 1}`)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= pages - 1)
    ),
  ];
}

async function activityMinDay(guildId) {
  const settings = await getGuildSettings(guildId);
  return getMinVisibleDay(guildId, settings.timezone);
}

async function renderActivitiesPage(guildId, page) {
  const minDay = await activityMinDay(guildId);
  const activityCount = await DB.countActivitiesForGuild(guildId, minDay);
  const safePage = clampPage(page, activityCount);
  const rows = await DB.topActivitiesForGuild(
    guildId,
    ACTIVITIES_PAGE_SIZE,
    safePage * ACTIVITIES_PAGE_SIZE,
    minDay
  );

  const embed = buildActivitiesEmbed(rows, { page: safePage, activityCount });
  if (!(await isPremiumGuild(guildId))) {
    embed.setFooter({
      text: `Free plan: last 90 days of activity time • ${activityCount} activities`,
    });
    embed.setDescription(
      (embed.data.description || "") + `\n\n${premiumUpsellNote()}`
    );
  }

  return {
    embed,
    components: buildActivitiesButtons(safePage, activityCount),
  };
}

export async function handleActivities(interaction) {
  try {
    await interaction.deferReply();
    const { embed, components } = await renderActivitiesPage(
      interaction.guildId,
      0
    );
    await interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    console.error("handleActivities error:", err);
    const content =
      err?.message?.includes("MongoDB") || err?.message?.includes("SSL")
        ? "Could not load activities from MongoDB. Check MONGODB_URI and Atlas network access."
        : `Activities failed: ${err?.message || "error"}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
    }
  }
}

export async function handleActivitiesPageButton(interaction) {
  const parts = interaction.customId.split(":");
  if (parts.length !== 3 || parts[0] !== "activities" || parts[1] !== "page") {
    return;
  }

  const page = Number(parts[2]);
  if (!Number.isInteger(page) || page < 0) return;

  await interaction.deferUpdate();

  const { embed, components } = await renderActivitiesPage(
    interaction.guildId,
    page
  );

  await interaction.editReply({ embeds: [embed], components }).catch((err) => {
    if (err?.code === 10008 || err?.code === 10062) return;
    throw err;
  });
}
