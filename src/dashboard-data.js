import { getDb } from "./db/mongo.js";
import { getMinVisibleDay, isPremiumGuild } from "./plan.js";
import { getGuildSettings } from "./guild-settings.js";

const CALENDAR_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayMatch(guild_id, minDay) {
  const match = { guild_id, day: { $regex: CALENDAR_DAY_RE } };
  if (minDay) match.day = { $gte: minDay, $regex: CALENDAR_DAY_RE };
  return match;
}

async function resolveMinDay(guild_id) {
  const settings = await getGuildSettings(guild_id);
  return getMinVisibleDay(guild_id, settings.timezone);
}

export async function listGuilds() {
  const db = await getDb();
  const ids = new Set();
  for (const name of [
    "user_daily",
    "channel_daily",
    "economy_balances",
    "activity_totals",
    "guild_settings",
  ]) {
    const field = name === "guild_settings" ? "guild_id" : "guild_id";
    const guilds = await db.collection(name).distinct(field);
    for (const g of guilds) ids.add(g);
  }
  return [...ids].sort();
}

export async function getGuildPlanInfo(guild_id) {
  const premium = await isPremiumGuild(guild_id);
  const settings = await getGuildSettings(guild_id);
  const minDay = await getMinVisibleDay(guild_id, settings.timezone);
  return { plan: premium ? "premium" : "free", minDay };
}

export async function getGuildOverview(guild_id) {
  const db = await getDb();
  const minDay = await resolveMinDay(guild_id);
  const match = dayMatch(guild_id, minDay);

  const [totals] = await db
    .collection("user_daily")
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          messages: { $sum: "$messages" },
          voice_seconds: { $sum: "$voice_seconds" },
        },
      },
    ])
    .toArray();

  const userFilter = { guild_id };
  if (minDay) userFilter.day = { $gte: minDay };

  const uniqueUsers = await db.collection("user_daily").distinct("user_id", userFilter);
  const uniqueChannels = await db
    .collection("channel_daily")
    .distinct("channel_id", minDay ? { guild_id, day: { $gte: minDay } } : { guild_id });
  const economyUsers = await db
    .collection("economy_balances")
    .countDocuments({ guild_id });
  const [economySum] = await db
    .collection("economy_balances")
    .aggregate([
      { $match: { guild_id } },
      { $group: { _id: null, total: { $sum: "$balance" } } },
    ])
    .toArray();
  const voiceSessions = await db
    .collection("voice_sessions")
    .countDocuments({ guild_id });
  const activitySessions = await db
    .collection("activity_sessions")
    .countDocuments({ guild_id });
  const joinCount = await db.collection("member_joins").countDocuments({ guild_id });
  const boostCount = await db.collection("boost_events").countDocuments({ guild_id });

  return {
    messages: Number(totals?.messages ?? 0),
    voice_seconds: Number(totals?.voice_seconds ?? 0),
    unique_users: uniqueUsers.length,
    unique_channels: uniqueChannels.length,
    economy_users: economyUsers,
    economy_total_balance: Number(economySum?.total ?? 0),
    active_voice_sessions: voiceSessions,
    active_activity_sessions: activitySessions,
    member_joins: joinCount,
    boost_events: boostCount,
  };
}

export async function topUsersByMessages(guild_id, limit = 25) {
  const db = await getDb();
  const minDay = await resolveMinDay(guild_id);
  const match = dayMatch(guild_id, minDay);

  return db
    .collection("user_daily")
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: "$user_id",
          messages: { $sum: "$messages" },
          voice_seconds: { $sum: "$voice_seconds" },
        },
      },
      { $sort: { messages: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          user_id: "$_id",
          messages: 1,
          voice_seconds: 1,
        },
      },
    ])
    .toArray();
}

export async function topChannels(guild_id, limit = 25) {
  const db = await getDb();
  const minDay = await resolveMinDay(guild_id);
  const match = { guild_id };
  if (minDay) match.day = { $gte: minDay, $regex: CALENDAR_DAY_RE };

  return db
    .collection("channel_daily")
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: "$channel_id",
          messages: { $sum: "$messages" },
          voice_seconds: { $sum: "$voice_seconds" },
        },
      },
      { $sort: { messages: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          channel_id: "$_id",
          messages: 1,
          voice_seconds: 1,
        },
      },
    ])
    .toArray();
}

export async function listEconomy(guild_id, limit = 50, skip = 0) {
  const db = await getDb();
  return db
    .collection("economy_balances")
    .find({ guild_id })
    .sort({ balance: -1 })
    .skip(skip)
    .limit(limit)
    .project({ _id: 0 })
    .toArray();
}

export async function listMemberJoins(guild_id, limit = 50) {
  const db = await getDb();
  return db
    .collection("member_joins")
    .find({ guild_id })
    .sort({ joined_at_ms: -1 })
    .limit(limit)
    .project({ _id: 0 })
    .toArray();
}

export async function listBoostEvents(guild_id, limit = 50, startMs = null, endMs = null) {
  const db = await getDb();
  const filter = { guild_id };
  if (startMs != null || endMs != null) {
    filter.boosted_at_ms = {};
    if (startMs != null) filter.boosted_at_ms.$gte = startMs;
    if (endMs != null) filter.boosted_at_ms.$lt = endMs;
  }
  return db
    .collection("boost_events")
    .find(filter)
    .sort({ boosted_at_ms: -1 })
    .limit(limit)
    .project({ _id: 0 })
    .toArray();
}

export async function listActivityTotals(guild_id, limit = 50, skip = 0) {
  const db = await getDb();
  const minDay = await resolveMinDay(guild_id);
  const collection = minDay ? "activity_daily" : "activity_totals";

  if (minDay) {
    return db
      .collection(collection)
      .aggregate([
        { $match: { guild_id, day: { $gte: minDay } } },
        {
          $group: {
            _id: { activity_name: "$activity_name", user_id: "$user_id" },
            total_seconds: { $sum: "$seconds" },
          },
        },
        { $sort: { total_seconds: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            activity_name: "$_id.activity_name",
            user_id: "$_id.user_id",
            total_seconds: 1,
          },
        },
      ])
      .toArray();
  }

  return db
    .collection("activity_totals")
    .aggregate([
      { $match: { guild_id } },
      {
        $group: {
          _id: { activity_name: "$activity_name", user_id: "$user_id" },
          total_seconds: { $sum: "$total_seconds" },
        },
      },
      { $sort: { total_seconds: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          activity_name: "$_id.activity_name",
          user_id: "$_id.user_id",
          total_seconds: 1,
        },
      },
    ])
    .toArray();
}

export async function listVoiceSessions(guild_id) {
  const db = await getDb();
  return db
    .collection("voice_sessions")
    .find({ guild_id })
    .project({ _id: 0 })
    .toArray();
}

const RANKINGS_PAGE_SIZE = 10;

function dayRangeMatch(guild_id, startDay, endDay) {
  return {
    guild_id,
    day: { $gte: startDay, $lte: endDay, $regex: CALENDAR_DAY_RE },
  };
}

async function countGroupedUsers(guild_id, startDay, endDay, metric) {
  const db = await getDb();
  const gtField = metric === "messages" ? { messages: { $gt: 0 } } : { voice_seconds: { $gt: 0 } };
  const [row] = await db
    .collection("user_daily")
    .aggregate([
      { $match: dayRangeMatch(guild_id, startDay, endDay) },
      {
        $group: {
          _id: "$user_id",
          messages: { $sum: "$messages" },
          voice_seconds: { $sum: "$voice_seconds" },
        },
      },
      { $match: gtField },
      { $count: "count" },
    ])
    .toArray();
  return Number(row?.count ?? 0);
}

async function topUsersByMetricRange(guild_id, startDay, endDay, metric, limit, skip) {
  const db = await getDb();
  const sortKey = metric === "messages" ? "messages" : "voice_seconds";
  const gtField = metric === "messages" ? { messages: { $gt: 0 } } : { voice_seconds: { $gt: 0 } };

  return db
    .collection("user_daily")
    .aggregate([
      { $match: dayRangeMatch(guild_id, startDay, endDay) },
      {
        $group: {
          _id: "$user_id",
          messages: { $sum: "$messages" },
          voice_seconds: { $sum: "$voice_seconds" },
        },
      },
      { $match: gtField },
      { $sort: { [sortKey]: -1, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          user_id: "$_id",
          messages: 1,
          voice_seconds: 1,
        },
      },
    ])
    .toArray();
}

async function countGamesInRange(guild_id, startDay, endDay) {
  const db = await getDb();
  const [row] = await db
    .collection("activity_daily")
    .aggregate([
      { $match: { guild_id, day: { $gte: startDay, $lte: endDay, $regex: CALENDAR_DAY_RE } } },
      { $group: { _id: "$activity_name" } },
      { $count: "count" },
    ])
    .toArray();
  return Number(row?.count ?? 0);
}

async function topGamesInRange(guild_id, startDay, endDay, limit, skip) {
  const db = await getDb();
  return db
    .collection("activity_daily")
    .aggregate([
      { $match: { guild_id, day: { $gte: startDay, $lte: endDay, $regex: CALENDAR_DAY_RE } } },
      {
        $group: {
          _id: "$activity_name",
          total_seconds: { $sum: "$seconds" },
          players: { $addToSet: "$user_id" },
        },
      },
      { $sort: { total_seconds: -1, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          activity_name: "$_id",
          total_seconds: 1,
          player_count: { $size: "$players" },
        },
      },
    ])
    .toArray();
}

export async function getGuildRankings(
  guild_id,
  { startDay, endDay, messagesPage = 0, voicePage = 0, gamesPage = 0, pageSize = RANKINGS_PAGE_SIZE }
) {
  const skipMessages = messagesPage * pageSize;
  const skipVoice = voicePage * pageSize;
  const skipGames = gamesPage * pageSize;

  const [messagesTotal, voiceTotal, gamesTotal, messages, voice, games] = await Promise.all([
    countGroupedUsers(guild_id, startDay, endDay, "messages"),
    countGroupedUsers(guild_id, startDay, endDay, "voice_seconds"),
    countGamesInRange(guild_id, startDay, endDay),
    topUsersByMetricRange(guild_id, startDay, endDay, "messages", pageSize, skipMessages),
    topUsersByMetricRange(guild_id, startDay, endDay, "voice_seconds", pageSize, skipVoice),
    topGamesInRange(guild_id, startDay, endDay, pageSize, skipGames),
  ]);

  return {
    pageSize,
    messages: {
      page: messagesPage,
      total: messagesTotal,
      totalPages: Math.max(1, Math.ceil(messagesTotal / pageSize)),
      items: messages,
    },
    voice: {
      page: voicePage,
      total: voiceTotal,
      totalPages: Math.max(1, Math.ceil(voiceTotal / pageSize)),
      items: voice,
    },
    games: {
      page: gamesPage,
      total: gamesTotal,
      totalPages: Math.max(1, Math.ceil(gamesTotal / pageSize)),
      items: games,
    },
  };
}

export async function guildDailySeries(guild_id, days = 30) {
  const db = await getDb();
  const minDay = await resolveMinDay(guild_id);

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const y = cutoff.getUTCFullYear();
  const m = String(cutoff.getUTCMonth() + 1).padStart(2, "0");
  const d = String(cutoff.getUTCDate()).padStart(2, "0");
  let startDay = `${y}-${m}-${d}`;
  if (minDay && startDay < minDay) startDay = minDay;

  return db
    .collection("user_daily")
    .aggregate([
      { $match: { guild_id, day: { $gte: startDay } } },
      {
        $group: {
          _id: "$day",
          messages: { $sum: "$messages" },
          voice_seconds: { $sum: "$voice_seconds" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          day: "$_id",
          messages: 1,
          voice_seconds: 1,
        },
      },
    ])
    .toArray();
}
