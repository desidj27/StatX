import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { DB } from "./db.js";
import { renderRouletteSpinGif, renderRouletteStillPng } from "./render_roulette.js";

export const FEATURE_DISABLED =
  "Economy is disabled for this server. An admin can enable it in the dashboard.";

const RPS_TTL_MS = 2 * 60_000;
const rpsChallenges = new Map(); // challengeId -> state

const ROULETTE_RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const rouletteCommand = new SlashCommandBuilder()
  .setName("roulette")
  .setDescription("Bet coins on roulette.")
  .addIntegerOption((o) =>
    o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
  )
  .addStringOption((o) =>
    o
      .setName("bet_on")
      .setDescription("What to bet on")
      .setRequired(true)
      .addChoices(
        { name: "Red (1:1)", value: "red" },
        { name: "Black (1:1)", value: "black" },
        { name: "Green / 0 (35:1)", value: "green" },
        { name: "Odd (1:1)", value: "odd" },
        { name: "Even (1:1)", value: "even" },
        { name: "Low 1–18 (1:1)", value: "low" },
        { name: "High 19–36 (1:1)", value: "high" },
        { name: "Straight number (35:1) — set number option", value: "number" }
      )
  )
  .addIntegerOption((o) =>
    o
      .setName("number")
      .setDescription("Pocket 0–36 (required when bet_on is Straight number)")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(36)
  );

export const rpsCommand = new SlashCommandBuilder()
  .setName("rps")
  .setDescription("Challenge another member to Rock Paper Scissors for coins.")
  .addUserOption((o) =>
    o.setName("opponent").setDescription("Who to challenge").setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName("bet").setDescription("Amount each player bets").setRequired(true).setMinValue(1)
  );

export const baltopCommand = new SlashCommandBuilder()
  .setName("baltop")
  .setDescription("Economy balance leaderboard for this server.")
  .addIntegerOption((o) =>
    o
      .setName("page")
      .setDescription("Page number")
      .setRequired(false)
      .setMinValue(1)
  );

export const econstatsCommand = new SlashCommandBuilder()
  .setName("econstats")
  .setDescription("Show gambling stats (biggest bet, win/loss streaks).")
  .addUserOption((o) =>
    o.setName("user").setDescription("User to check (optional)").setRequired(false)
  );

export async function ensureBettable(interaction, bet) {
  if (bet <= 0) {
    await interaction.reply({
      content: "Bet must be at least 1.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  const bal = await DB.getBalance(interaction.guildId, interaction.user.id);
  if (bal.balance < bet) {
    await interaction.reply({
      content: `You need **${bet}** coins, but you only have **${bal.balance}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return bal.balance;
}

function pocketColor(n) {
  if (n === 0) return "green";
  return ROULETTE_RED.has(n) ? "red" : "black";
}

function roulettePayoutMultiplier(betOn, number, pocket) {
  if (betOn === "number") {
    return pocket === number ? 36 : 0; // stake returned in 35:1 net → pay 36x stake
  }
  if (betOn === "green") return pocket === 0 ? 36 : 0;
  if (pocket === 0) return 0;

  if (betOn === "red") return pocketColor(pocket) === "red" ? 2 : 0;
  if (betOn === "black") return pocketColor(pocket) === "black" ? 2 : 0;
  if (betOn === "odd") return pocket % 2 === 1 ? 2 : 0;
  if (betOn === "even") return pocket % 2 === 0 ? 2 : 0;
  if (betOn === "low") return pocket >= 1 && pocket <= 18 ? 2 : 0;
  if (betOn === "high") return pocket >= 19 && pocket <= 36 ? 2 : 0;
  return 0;
}

function betLabel(betOn, number) {
  if (betOn === "number") return `number **${number}**`;
  return `**${betOn}**`;
}

export async function handleRoulette(interaction) {
  const bet = interaction.options.getInteger("bet", true);
  const betOn = interaction.options.getString("bet_on", true);
  const number = interaction.options.getInteger("number");

  if (betOn === "number" && (number == null || number < 0 || number > 36)) {
    await interaction.reply({
      content: "Pick a pocket **0–36** when betting on a straight number.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if ((await ensureBettable(interaction, bet)) == null) return;

  await interaction.deferReply();

  const ok = await DB.trySubtractBalance(interaction.guildId, interaction.user.id, bet);
  if (!ok) {
    await interaction.editReply({ content: "Bet failed. Try again." });
    return;
  }

  const pocket = Math.floor(Math.random() * 37); // 0–36
  const color = pocketColor(pocket);
  const mult = roulettePayoutMultiplier(betOn, number ?? -1, pocket);
  const payout = bet * mult;

  let outcome;
  let balance;
  if (payout > 0) {
    const updated = await DB.addBalance(interaction.guildId, interaction.user.id, payout);
    await DB.recordGamblingResult(interaction.guildId, interaction.user.id, {
      bet,
      won: true,
      net: payout - bet,
      game: "roulette",
    });
    outcome = `You won **${payout - bet}** coins (paid **${payout}** including stake).`;
    balance = updated.balance;
  } else {
    const updated = await DB.getBalance(interaction.guildId, interaction.user.id);
    await DB.recordGamblingResult(interaction.guildId, interaction.user.id, {
      bet,
      won: false,
      net: -bet,
      game: "roulette",
    });
    outcome = `You lost **${bet}** coins.`;
    balance = updated.balance;
  }

  let files = [];
  try {
    const gif = renderRouletteSpinGif(pocket);
    files = [new AttachmentBuilder(gif, { name: "roulette.gif" })];
  } catch (err) {
    console.error("roulette gif render failed:", err);
    try {
      const png = renderRouletteStillPng(pocket);
      files = [new AttachmentBuilder(png, { name: "roulette.png" })];
    } catch (err2) {
      console.error("roulette still render failed:", err2);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("Roulette")
    .setColor(color === "red" ? 0xe74c3c : color === "black" ? 0x2b2d31 : 0x2ecc71)
    .setDescription(
      [
        `Bet **${bet}** on ${betLabel(betOn, number)}`,
        `Ball landed on **${pocket}** (${color})`,
        outcome,
        `Balance: **${balance}**`,
      ].join("\n")
    );

  if (files.length) {
    embed.setImage(`attachment://${files[0].name}`);
  }

  await interaction.editReply({ embeds: [embed], files });
}

function rpsWinner(a, b) {
  if (a === b) return 0;
  if (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  ) {
    return 1;
  }
  return 2;
}

function rpsPickRow(challengeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rps:${challengeId}:pick:rock`)
      .setLabel("Rock")
      .setEmoji("🪨")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rps:${challengeId}:pick:paper`)
      .setLabel("Paper")
      .setEmoji("📄")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rps:${challengeId}:pick:scissors`)
      .setLabel("Scissors")
      .setEmoji("✂️")
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function handleRpsChallenge(interaction) {
  const opponent = interaction.options.getUser("opponent", true);
  const bet = interaction.options.getInteger("bet", true);

  if (opponent.bot) {
    await interaction.reply({
      content: "You can't challenge a bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (opponent.id === interaction.user.id) {
    await interaction.reply({
      content: "You can't challenge yourself.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if ((await ensureBettable(interaction, bet)) == null) return;

  const oppBal = await DB.getBalance(interaction.guildId, opponent.id);
  if (oppBal.balance < bet) {
    await interaction.reply({
      content: `${opponent} only has **${oppBal.balance}** coins (need **${bet}**).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const challengeId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  rpsChallenges.set(challengeId, {
    guildId: interaction.guildId,
    bet,
    challengerId: interaction.user.id,
    opponentId: opponent.id,
    status: "pending",
    picks: {},
    expiresAt: Date.now() + RPS_TTL_MS,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rps:${challengeId}:accept`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rps:${challengeId}:decline`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle("Rock Paper Scissors")
    .setColor(0x5865f2)
    .setDescription(
      [
        `${interaction.user} challenged ${opponent} for **${bet}** coins each.`,
        `${opponent}, accept or decline within 2 minutes.`,
      ].join("\n")
    );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function settleRps(message, challenge, challengeId) {
  const { challengerId, opponentId, bet, picks, guildId } = challenge;
  const a = picks[challengerId];
  const b = picks[opponentId];
  const result = rpsWinner(a, b);

  const labels = { rock: "Rock 🪨", paper: "Paper 📄", scissors: "Scissors ✂️" };
  const embed = new EmbedBuilder()
    .setTitle("Rock Paper Scissors — Result")
    .setColor(0x2b2d31)
    .setDescription(
      [
        `<@${challengerId}> played **${labels[a]}**`,
        `<@${opponentId}> played **${labels[b]}**`,
      ].join("\n")
    );

  if (result === 0) {
    await DB.addBalance(guildId, challengerId, bet);
    await DB.addBalance(guildId, opponentId, bet);
    await DB.recordGamblingResult(guildId, challengerId, {
      bet,
      won: null,
      net: 0,
      game: "rps",
    });
    await DB.recordGamblingResult(guildId, opponentId, {
      bet,
      won: null,
      net: 0,
      game: "rps",
    });
    const balA = await DB.getBalance(guildId, challengerId);
    const balB = await DB.getBalance(guildId, opponentId);
    embed.addFields(
      { name: "Outcome", value: "Tie — bets returned." },
      {
        name: "Balances",
        value: `<@${challengerId}> **${balA.balance}** · <@${opponentId}> **${balB.balance}**`,
      }
    );
  } else {
    const winnerId = result === 1 ? challengerId : opponentId;
    const loserId = result === 1 ? opponentId : challengerId;
    const updated = await DB.addBalance(guildId, winnerId, bet * 2);
    await DB.recordGamblingResult(guildId, winnerId, {
      bet,
      won: true,
      net: bet,
      game: "rps",
    });
    await DB.recordGamblingResult(guildId, loserId, {
      bet,
      won: false,
      net: -bet,
      game: "rps",
    });
    const loserBal = await DB.getBalance(guildId, loserId);
    embed.addFields(
      { name: "Outcome", value: `<@${winnerId}> wins **${bet}** coins.` },
      {
        name: "Balances",
        value: `<@${winnerId}> **${updated.balance}** · <@${loserId}> **${loserBal.balance}**`,
      }
    );
  }

  rpsChallenges.delete(challengeId);
  await message.edit({ embeds: [embed], components: [] });
}

export async function handleRpsButton(interaction) {
  const parts = interaction.customId.split(":");
  // rps:id:accept|decline  OR  rps:id:pick:rock|paper|scissors:userId
  const challengeId = parts[1];
  const action = parts[2];
  const challenge = rpsChallenges.get(challengeId);

  if (!challenge) {
    await interaction.reply({
      content: "This RPS challenge is no longer active.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (Date.now() > challenge.expiresAt) {
    if (challenge.status === "active") {
      // refund whoever already paid
      if (challenge.escrowed) {
        await DB.addBalance(challenge.guildId, challenge.challengerId, challenge.bet);
        await DB.addBalance(challenge.guildId, challenge.opponentId, challenge.bet);
      }
    }
    rpsChallenges.delete(challengeId);
    await interaction.update({
      content: "Challenge expired.",
      embeds: [],
      components: [],
    });
    return true;
  }

  if (action === "decline") {
    if (interaction.user.id !== challenge.opponentId) {
      await interaction.reply({
        content: "Only the challenged player can decline.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    rpsChallenges.delete(challengeId);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Rock Paper Scissors")
          .setColor(0x2b2d31)
          .setDescription(`${interaction.user} declined the challenge.`),
      ],
      components: [],
    });
    return true;
  }

  if (action === "accept") {
    if (interaction.user.id !== challenge.opponentId) {
      await interaction.reply({
        content: "Only the challenged player can accept.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const tookChallenger = await DB.trySubtractBalance(
      challenge.guildId,
      challenge.challengerId,
      challenge.bet
    );
    if (!tookChallenger) {
      rpsChallenges.delete(challengeId);
      await interaction.update({
        content: "Challenger can no longer cover the bet.",
        embeds: [],
        components: [],
      });
      return true;
    }

    const tookOpponent = await DB.trySubtractBalance(
      challenge.guildId,
      challenge.opponentId,
      challenge.bet
    );
    if (!tookOpponent) {
      await DB.addBalance(challenge.guildId, challenge.challengerId, challenge.bet);
      rpsChallenges.delete(challengeId);
      await interaction.update({
        content: "You can no longer cover the bet.",
        embeds: [],
        components: [],
      });
      return true;
    }

    challenge.status = "active";
    challenge.escrowed = true;
    challenge.expiresAt = Date.now() + RPS_TTL_MS;
    challenge.picks = {};

    const embed = new EmbedBuilder()
      .setTitle("Rock Paper Scissors")
      .setColor(0x5865f2)
      .setDescription(
        [
          `Bet locked: **${challenge.bet}** coins each.`,
          `<@${challenge.challengerId}> and <@${challenge.opponentId}> — pick privately with the buttons below.`,
        ].join("\n")
      );

    await interaction.update({
      embeds: [embed],
      components: [rpsPickRow(challengeId)],
    });
    return true;
  }

  if (action === "pick") {
    const pick = parts[3];
    if (
      interaction.user.id !== challenge.challengerId &&
      interaction.user.id !== challenge.opponentId
    ) {
      await interaction.reply({
        content: "You're not in this match.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (challenge.status !== "active") {
      await interaction.reply({
        content: "This match hasn't started.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (challenge.picks[interaction.user.id]) {
      await interaction.reply({
        content: "You already locked in a pick.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    challenge.picks[interaction.user.id] = pick;
    await interaction.reply({
      content: `Locked in **${pick}**. Waiting for the other player…`,
      flags: MessageFlags.Ephemeral,
    });

    if (
      challenge.picks[challenge.challengerId] &&
      challenge.picks[challenge.opponentId]
    ) {
      await settleRps(interaction.message, challenge, challengeId);
    }
    return true;
  }

  return false;
}

export async function handleBaltop(interaction) {
  const page = (interaction.options.getInteger("page") ?? 1) - 1;
  const pageSize = 10;
  const { items, total } = await DB.listEconomyLeaderboard(
    interaction.guildId,
    pageSize,
    page * pageSize
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!items.length) {
    await interaction.reply({ content: "No balances yet." });
    return;
  }

  const lines = await Promise.all(
    items.map(async (row, idx) => {
      const rank = page * pageSize + idx + 1;
      const member = await interaction.guild.members.fetch(row.user_id).catch(() => null);
      const name = member?.displayName ?? `User ${row.user_id.slice(-4)}`;
      return `**${rank}.** ${name} — **${Number(row.balance).toLocaleString()}** coins`;
    })
  );

  const embed = new EmbedBuilder()
    .setTitle("Economy leaderboard")
    .setColor(0xfaa61a)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Page ${page + 1}/${totalPages} · ${total} players` });

  await interaction.reply({ embeds: [embed] });
}

export async function handleEconstats(interaction) {
  const user = interaction.options.getUser("user") ?? interaction.user;
  const stats = await DB.getBalance(interaction.guildId, user.id);

  const embed = new EmbedBuilder()
    .setTitle(`Economy stats — ${user.username}`)
    .setColor(0xfaa61a)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: "Balance", value: `**${stats.balance.toLocaleString()}**`, inline: true },
      { name: "Daily streak", value: `**${stats.daily_streak}**`, inline: true },
      { name: "Biggest bet", value: `**${stats.biggest_bet.toLocaleString()}**`, inline: true },
      {
        name: "Longest win streak",
        value: `**${stats.longest_win_streak}**`,
        inline: true,
      },
      {
        name: "Longest loss streak",
        value: `**${stats.longest_loss_streak}**`,
        inline: true,
      },
      {
        name: "Current streak",
        value:
          stats.current_win_streak > 0
            ? `**${stats.current_win_streak}** wins`
            : stats.current_loss_streak > 0
              ? `**${stats.current_loss_streak}** losses`
              : "—",
        inline: true,
      },
      {
        name: "Total wagered",
        value: `**${stats.total_wagered.toLocaleString()}**`,
        inline: true,
      },
      {
        name: "Net from gambling",
        value: `**${(stats.total_won - stats.total_lost).toLocaleString()}**`,
        inline: true,
      }
    );

  await interaction.reply({ embeds: [embed] });
}

/** Record outcome for existing games (coinflip/dice/highlow). */
export async function trackBetResult(guildId, userId, { bet, won, net, game }) {
  await DB.recordGamblingResult(guildId, userId, { bet, won, net, game });
}
