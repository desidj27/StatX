import { MongoClient } from "mongodb";

export function utcDayString(ms = Date.now()) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CALENDAR_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertCalendarDay(day) {
  if (!CALENDAR_DAY_RE.test(day)) {
    throw new Error(`Invalid stats day (expected YYYY-MM-DD): ${String(day)}`);
  }
}

function calendarDayRange(startDay, endDay) {
  return { $gte: startDay, $lte: endDay, $regex: CALENDAR_DAY_RE };
}

/** Set DB_LOG=0 to silence database write logs. */
function logDbWrite(op, fields = {}) {
  if (process.env.DB_LOG === "0") return;
  const parts = Object.entries(fields)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[db] ${op}${parts.length ? " " + parts.join(" ") : ""}`);
}

export function requireMongoEnv() {
  const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI (or MONGO_URI). Set it in .env (bot + Vercel) so all data is stored in MongoDB Atlas."
    );
  }
  return uri;
}

function clientOptions() {
  const uri = requireMongoEnv();
  return { uri, dbName: process.env.MONGODB_DB ?? "degeneratebot" };
}

export function mongoConnectionLabel() {
  const uri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? "";
  try {
    const normalized = uri
      .replace(/^mongodb\+srv:/, "https:")
      .replace(/^mongodb:/, "http:");
    const u = new URL(normalized);
    return `${u.hostname} / db: ${process.env.MONGODB_DB ?? "degeneratebot"}`;
  } catch {
    return "MongoDB (custom URI)";
  }
}

function mongoDriverOptions() {
  return {
    serverSelectionTimeoutMS: 20_000,
    connectTimeoutMS: 20_000,
    family: 4,
  };
}

function wrapMongoConnectError(err) {
  const msg = err?.message ?? String(err);
  const ssl =
    msg.includes("SSL") ||
    msg.includes("TLS") ||
    err?.cause?.code === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR";
  if (ssl) {
    return new Error(
      "MongoDB could not connect (SSL/TLS). In Atlas: Network Access -> add 0.0.0.0/0. " +
        msg
    );
  }
  return err;
}

const globalForMongo = globalThis;

export async function getMongoClient() {
  if (!globalForMongo._mongoClientPromise) {
    const { uri } = clientOptions();
    const client = new MongoClient(uri, mongoDriverOptions());
    globalForMongo._mongoClientPromise = client
      .connect()
      .then(() => client)
      .catch((err) => {
        globalForMongo._mongoClientPromise = null;
        throw wrapMongoConnectError(err);
      });
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb() {
  const client = await getMongoClient();
  const { dbName } = clientOptions();
  return client.db(dbName);
}

async function col(name) {
  return (await getDb()).collection(name);
}

export const DB = (() => {
  let indexesReady = false;

  async function ensureIndexes() {
    if (indexesReady) return;
    const db = await getDb();
    await Promise.all([
      db.collection("user_daily").createIndex(
        { guild_id: 1, user_id: 1, day: 1 },
        { unique: true }
      ),
      db.collection("channel_daily").createIndex(
        { guild_id: 1, channel_id: 1, day: 1 },
        { unique: true }
      ),
      db.collection("voice_sessions").createIndex(
        { guild_id: 1, user_id: 1 },
        { unique: true }
      ),
      db.collection("activity_sessions").createIndex(
        { guild_id: 1, user_id: 1 },
        { unique: true }
      ),
      db.collection("activity_totals").createIndex(
        { guild_id: 1, user_id: 1, activity_name: 1 },
        { unique: true }
      ),
      db.collection("economy_balances").createIndex(
        { guild_id: 1, user_id: 1 },
        { unique: true }
      ),
      db.collection("member_joins").createIndex({ guild_id: 1, joined_at_ms: 1 }),
      db.collection("boost_events").createIndex({ guild_id: 1, boosted_at_ms: 1 }),
      db.collection("guild_settings").createIndex({ guild_id: 1 }, { unique: true }),
      db.collection("guild_subscriptions").createIndex({ guild_id: 1 }, { unique: true }),
      db.collection("guild_subscriptions").createIndex(
        { stripe_subscription_id: 1 },
        { unique: true, sparse: true }
      ),
      db.collection("activity_daily").createIndex(
        { guild_id: 1, user_id: 1, activity_name: 1, day: 1 },
        { unique: true }
      ),
      db.collection("activity_meta").createIndex(
        { guild_id: 1, activity_name: 1 },
        { unique: true }
      ),
    ]);
    indexesReady = true;
  }

  async function init() {
    await ensureIndexes();
  }

  async function incUserMsg({ guild_id, user_id, day }) {
    assertCalendarDay(day);
    logDbWrite("user_daily +1 message", { guild_id, user_id, day });
    await (
      await col("user_daily")
    ).updateOne(
      { guild_id, user_id, day },
      { $inc: { messages: 1 }, $setOnInsert: { voice_seconds: 0 } },
      { upsert: true }
    );
  }

  async function incChannelMsg({ guild_id, channel_id, day }) {
    assertCalendarDay(day);
    logDbWrite("channel_daily +1 message", { guild_id, channel_id, day });
    await (
      await col("channel_daily")
    ).updateOne(
      { guild_id, channel_id, day },
      { $inc: { messages: 1 }, $setOnInsert: { voice_seconds: 0 } },
      { upsert: true }
    );
  }

  async function addUserVoice({ guild_id, user_id, day, voice_seconds }) {
    assertCalendarDay(day);
    if (voice_seconds > 0) {
      logDbWrite("user_daily +voice", {
        guild_id,
        user_id,
        day,
        voice_seconds,
      });
    }
    await (
      await col("user_daily")
    ).updateOne(
      { guild_id, user_id, day },
      { $inc: { voice_seconds }, $setOnInsert: { messages: 0 } },
      { upsert: true }
    );
  }

  async function addChannelVoice({ guild_id, channel_id, day, voice_seconds }) {
    assertCalendarDay(day);
    if (voice_seconds > 0) {
      logDbWrite("channel_daily +voice", {
        guild_id,
        channel_id,
        day,
        voice_seconds,
      });
    }
    await (
      await col("channel_daily")
    ).updateOne(
      { guild_id, channel_id, day },
      { $inc: { voice_seconds }, $setOnInsert: { messages: 0 } },
      { upsert: true }
    );
  }

  async function upsertSession({ guild_id, user_id, channel_id, started_at_ms }) {
    logDbWrite("voice_sessions upsert", {
      guild_id,
      user_id,
      channel_id,
      started_at_ms,
    });
    await (
      await col("voice_sessions")
    ).updateOne(
      { guild_id, user_id },
      { $set: { channel_id, started_at_ms } },
      { upsert: true }
    );
  }

  async function getSession(guild_id, user_id) {
    return (await col("voice_sessions")).findOne({ guild_id, user_id });
  }

  async function deleteSession(guild_id, user_id) {
    logDbWrite("voice_sessions delete", { guild_id, user_id });
    await (await col("voice_sessions")).deleteOne({ guild_id, user_id });
  }

  async function listSessionsForGuild(guild_id) {
    return (await col("voice_sessions")).find({ guild_id }).toArray();
  }

  /** Seconds in VC since last flush (not yet in user_daily). */
  async function ongoingUserVoiceSeconds(guild_id, user_id) {
    const sess = await getSession(guild_id, user_id);
    if (!sess?.started_at_ms) return 0;
    return Math.max(0, Math.floor((Date.now() - sess.started_at_ms) / 1000));
  }

  async function ongoingChannelVoiceSeconds(guild_id, channel_id) {
    const sessions = await listSessionsForGuild(guild_id);
    const now = Date.now();
    let total = 0;
    for (const sess of sessions) {
      if (sess.channel_id !== channel_id || !sess.started_at_ms) continue;
      total += Math.max(0, Math.floor((now - sess.started_at_ms) / 1000));
    }
    return total;
  }

  async function sumUserRange(guild_id, user_id, startDay, endDay) {
    const rows = await (
      await col("user_daily")
    )
      .aggregate([
        {
          $match: {
            guild_id,
            user_id,
            day: calendarDayRange(startDay, endDay),
          },
        },
        {
          $group: {
            _id: null,
            messages: { $sum: "$messages" },
            voice_seconds: { $sum: "$voice_seconds" },
          },
        },
      ])
      .toArray();
    const row = rows[0] ?? { messages: 0, voice_seconds: 0 };
    return {
      messages: Number(row.messages ?? 0),
      voice_seconds: Number(row.voice_seconds ?? 0),
    };
  }

  async function sumUserAllTime(guild_id, user_id) {
    const rows = await (
      await col("user_daily")
    )
      .aggregate([
        { $match: { guild_id, user_id, day: { $regex: CALENDAR_DAY_RE } } },
        {
          $group: {
            _id: null,
            messages: { $sum: "$messages" },
            voice_seconds: { $sum: "$voice_seconds" },
          },
        },
      ])
      .toArray();
    const row = rows[0] ?? { messages: 0, voice_seconds: 0 };
    return {
      messages: Number(row.messages ?? 0),
      voice_seconds: Number(row.voice_seconds ?? 0),
    };
  }

  async function sumGuildAllTime(guild_id) {
    const rows = await (
      await col("user_daily")
    )
      .aggregate([
        { $match: { guild_id, day: { $regex: CALENDAR_DAY_RE } } },
        {
          $group: {
            _id: null,
            messages: { $sum: "$messages" },
            voice_seconds: { $sum: "$voice_seconds" },
          },
        },
      ])
      .toArray();
    const row = rows[0] ?? { messages: 0, voice_seconds: 0 };
    return {
      messages: Number(row.messages ?? 0),
      voice_seconds: Number(row.voice_seconds ?? 0),
    };
  }

  async function sumChannelRange(guild_id, channel_id, startDay, endDay) {
    const rows = await (
      await col("channel_daily")
    )
      .aggregate([
        {
          $match: {
            guild_id,
            channel_id,
            day: calendarDayRange(startDay, endDay),
          },
        },
        {
          $group: {
            _id: null,
            messages: { $sum: "$messages" },
            voice_seconds: { $sum: "$voice_seconds" },
          },
        },
      ])
      .toArray();
    const row = rows[0] ?? { messages: 0, voice_seconds: 0 };
    return {
      messages: Number(row.messages ?? 0),
      voice_seconds: Number(row.voice_seconds ?? 0),
    };
  }

  async function seriesUserRange(guild_id, user_id, startDay, endDay) {
    const rows = await (
      await col("user_daily")
    )
      .find({
        guild_id,
        user_id,
        day: calendarDayRange(startDay, endDay),
      })
      .sort({ day: 1 })
      .toArray();
    return rows.map((r) => ({
      day: r.day,
      messages: Number(r.messages ?? 0),
      voice_seconds: Number(r.voice_seconds ?? 0),
    }));
  }

  async function seriesChannelRange(guild_id, channel_id, startDay, endDay) {
    const rows = await (
      await col("channel_daily")
    )
      .find({ guild_id, channel_id, day: calendarDayRange(startDay, endDay) })
      .sort({ day: 1 })
      .toArray();
    return rows.map((r) => ({
      day: r.day,
      messages: Number(r.messages ?? 0),
      voice_seconds: Number(r.voice_seconds ?? 0),
    }));
  }

  async function firstUserDay(guild_id, user_id) {
    const row = await (
      await col("user_daily")
    )
      .find({
        guild_id,
        user_id,
        $or: [{ messages: { $gt: 0 } }, { voice_seconds: { $gt: 0 } }],
      })
      .sort({ day: 1 })
      .limit(1)
      .next();
    return row?.day ?? null;
  }

  async function firstChannelDay(guild_id, channel_id) {
    const row = await (
      await col("channel_daily")
    )
      .find({
        guild_id,
        channel_id,
        $or: [{ messages: { $gt: 0 } }, { voice_seconds: { $gt: 0 } }],
      })
      .sort({ day: 1 })
      .limit(1)
      .next();
    return row?.day ?? null;
  }

  async function topUserMessagesRange(guild_id, startDay, endDay, limit = 1) {
    const rows = await (
      await col("user_daily")
    )
      .aggregate([
        { $match: { guild_id, day: { $gte: startDay, $lte: endDay } } },
        { $group: { _id: "$user_id", messages: { $sum: "$messages" } } },
        { $sort: { messages: -1 } },
        { $limit: limit },
        { $project: { _id: 0, user_id: "$_id", messages: 1 } },
      ])
      .toArray();
    return rows.map((r) => ({
      user_id: r.user_id,
      messages: Number(r.messages ?? 0),
    }));
  }

  async function topUserVoiceRange(guild_id, startDay, endDay, limit = 1) {
    const rows = await (
      await col("user_daily")
    )
      .aggregate([
        { $match: { guild_id, day: { $gte: startDay, $lte: endDay } } },
        { $group: { _id: "$user_id", voice_seconds: { $sum: "$voice_seconds" } } },
        { $sort: { voice_seconds: -1 } },
        { $limit: limit },
        { $project: { _id: 0, user_id: "$_id", voice_seconds: 1 } },
      ])
      .toArray();
    return rows.map((r) => ({
      user_id: r.user_id,
      voice_seconds: Number(r.voice_seconds ?? 0),
    }));
  }

  async function logMemberJoin(guild_id, user_id, joined_at_ms) {
    logDbWrite("member_joins insert", { guild_id, user_id, joined_at_ms });
    await (
      await col("member_joins")
    ).insertOne({ guild_id, user_id, joined_at_ms });
  }

  async function countMemberJoinsBetween(guild_id, startMs, endMs) {
    return (await col("member_joins")).countDocuments({
      guild_id,
      joined_at_ms: { $gte: startMs, $lt: endMs },
    });
  }

  async function logBoostStart(guild_id, user_id, boosted_at_ms) {
    logDbWrite("boost_events insert", { guild_id, user_id, boosted_at_ms });
    await (
      await col("boost_events")
    ).insertOne({ guild_id, user_id, boosted_at_ms });
  }

  async function listBoostStartsBetween(guild_id, startMs, endMs, limit = 25) {
    const rows = await (
      await col("boost_events")
    )
      .find({ guild_id, boosted_at_ms: { $gte: startMs, $lt: endMs } })
      .sort({ boosted_at_ms: -1 })
      .limit(limit)
      .toArray();
    return rows.map((r) => ({
      user_id: r.user_id,
      boosted_at_ms: Number(r.boosted_at_ms ?? 0),
    }));
  }

  async function ensureEconomyUser(guild_id, user_id) {
    const res = await (
      await col("economy_balances")
    ).updateOne(
      { guild_id, user_id },
      {
        $setOnInsert: {
          balance: 0,
          last_daily_claim_ms: null,
          daily_streak: 0,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      logDbWrite("economy_balances insert", { guild_id, user_id });
    }
  }

  async function getBalance(guild_id, user_id) {
    await ensureEconomyUser(guild_id, user_id);
    const row =
      (await (await col("economy_balances")).findOne({ guild_id, user_id })) ??
      {};
    return {
      balance: Number(row.balance ?? 0),
      last_daily_claim_ms:
        row.last_daily_claim_ms == null ? null : Number(row.last_daily_claim_ms),
      daily_streak: Number(row.daily_streak ?? 0),
    };
  }

  async function addBalance(guild_id, user_id, amount) {
    await ensureEconomyUser(guild_id, user_id);
    logDbWrite("economy_balances +balance", { guild_id, user_id, amount });
    await (
      await col("economy_balances")
    ).updateOne({ guild_id, user_id }, { $inc: { balance: amount } });
    return getBalance(guild_id, user_id);
  }

  async function trySubtractBalance(guild_id, user_id, amount) {
    await ensureEconomyUser(guild_id, user_id);
    logDbWrite("economy_balances -balance attempt", { guild_id, user_id, amount });
    const res = await (
      await col("economy_balances")
    ).updateOne(
      { guild_id, user_id, balance: { $gte: amount } },
      { $inc: { balance: -amount } }
    );
    if (res.modifiedCount > 0) {
      logDbWrite("economy_balances -balance ok", { guild_id, user_id, amount });
    }
    return res.modifiedCount > 0;
  }

  async function applyDailyClaim(guild_id, user_id, nowMs, rewardAmount, newStreak) {
    await ensureEconomyUser(guild_id, user_id);
    logDbWrite("economy_balances daily claim", {
      guild_id,
      user_id,
      rewardAmount,
      newStreak,
    });
    await (
      await col("economy_balances")
    ).updateOne(
      { guild_id, user_id },
      {
        $inc: { balance: rewardAmount },
        $set: { last_daily_claim_ms: nowMs, daily_streak: newStreak },
      }
    );
    const updated = await getBalance(guild_id, user_id);
    return {
      balance: updated.balance,
      streak: newStreak,
      reward: rewardAmount,
    };
  }

  async function upsertActivitySession({
    guild_id,
    user_id,
    activity_name,
    started_at_ms,
  }) {
    logDbWrite("activity_sessions upsert", {
      guild_id,
      user_id,
      activity_name,
      started_at_ms,
    });
    await (
      await col("activity_sessions")
    ).updateOne(
      { guild_id, user_id },
      { $set: { activity_name, started_at_ms } },
      { upsert: true }
    );
  }

  async function getActivitySession(guild_id, user_id) {
    return (await col("activity_sessions")).findOne({ guild_id, user_id });
  }

  async function deleteActivitySession(guild_id, user_id) {
    logDbWrite("activity_sessions delete", { guild_id, user_id });
    await (await col("activity_sessions")).deleteOne({ guild_id, user_id });
  }

  async function listActivitySessionsForGuild(guild_id) {
    return (await col("activity_sessions")).find({ guild_id }).toArray();
  }

  async function addActivitySeconds({
    guild_id,
    user_id,
    activity_name,
    seconds,
    day = null,
  }) {
    if (!activity_name || seconds <= 0) return;
    logDbWrite("activity_totals +seconds", {
      guild_id,
      user_id,
      activity_name,
      seconds,
    });
    await (
      await col("activity_totals")
    ).updateOne(
      { guild_id, user_id, activity_name },
      { $inc: { total_seconds: seconds } },
      { upsert: true }
    );

    if (day) {
      assertCalendarDay(day);
      await (
        await col("activity_daily")
      ).updateOne(
        { guild_id, user_id, activity_name, day },
        { $inc: { seconds } },
        { upsert: true }
      );
    }
  }

  async function countActivitiesForGuild(guild_id, minDay = null) {
    const match = { guild_id };
    if (minDay) match.day = { $gte: minDay };

    const collection = minDay ? "activity_daily" : "activity_totals";
    const groupId = minDay ? "$activity_name" : "$activity_name";

    const pipeline = [{ $match: match }];
    if (minDay) {
      pipeline.push({
        $group: { _id: "$activity_name" },
      });
    } else {
      pipeline.push({ $group: { _id: groupId } });
    }
    pipeline.push({ $count: "count" });

    const rows = await (await col(collection)).aggregate(pipeline).toArray();
    return Number(rows[0]?.count ?? 0);
  }

  async function topActivitiesForGuild(guild_id, limit = 10, offset = 0, minDay = null) {
    if (minDay) {
      const rows = await (
        await col("activity_daily")
      )
        .aggregate([
          { $match: { guild_id, day: { $gte: minDay } } },
          {
            $group: {
              _id: "$activity_name",
              total_seconds: { $sum: "$seconds" },
            },
          },
          { $sort: { total_seconds: -1, _id: 1 } },
          { $skip: offset },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              activity_name: "$_id",
              total_seconds: 1,
            },
          },
        ])
        .toArray();
      return rows.map((r) => ({
        activity_name: r.activity_name,
        total_seconds: Number(r.total_seconds ?? 0),
      }));
    }

    const rows = await (
      await col("activity_totals")
    )
      .aggregate([
        { $match: { guild_id } },
        {
          $group: {
            _id: "$activity_name",
            total_seconds: { $sum: "$total_seconds" },
          },
        },
        { $sort: { total_seconds: -1, _id: 1 } },
        { $skip: offset },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            activity_name: "$_id",
            total_seconds: 1,
          },
        },
      ])
      .toArray();
    return rows.map((r) => ({
      activity_name: r.activity_name,
      total_seconds: Number(r.total_seconds ?? 0),
    }));
  }

  async function topActivitiesForUser(guild_id, user_id, limit = 3, minDay = null) {
    if (minDay) {
      const rows = await (
        await col("activity_daily")
      )
        .aggregate([
          { $match: { guild_id, user_id, day: { $gte: minDay } } },
          {
            $group: {
              _id: "$activity_name",
              total_seconds: { $sum: "$seconds" },
            },
          },
          { $sort: { total_seconds: -1, _id: 1 } },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              activity_name: "$_id",
              total_seconds: 1,
            },
          },
        ])
        .toArray();
      return rows.map((r) => ({
        activity_name: r.activity_name,
        total_seconds: Number(r.total_seconds ?? 0),
      }));
    }

    const rows = await (
      await col("activity_totals")
    )
      .find({ guild_id, user_id })
      .sort({ total_seconds: -1, activity_name: 1 })
      .limit(limit)
      .toArray();
    return rows.map((r) => ({
      activity_name: r.activity_name,
      total_seconds: Number(r.total_seconds ?? 0),
    }));
  }

  async function sumUserAllTimeSince(guild_id, user_id, minDay) {
    const match = { guild_id, user_id, day: { $regex: CALENDAR_DAY_RE } };
    if (minDay) match.day = calendarDayRange(minDay, "9999-12-31");

    const rows = await (
      await col("user_daily")
    )
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
    const row = rows[0] ?? { messages: 0, voice_seconds: 0 };
    return {
      messages: Number(row.messages ?? 0),
      voice_seconds: Number(row.voice_seconds ?? 0),
    };
  }

  async function sumGuildAllTimeSince(guild_id, minDay) {
    const match = { guild_id, day: { $regex: CALENDAR_DAY_RE } };
    if (minDay) match.day = calendarDayRange(minDay, "9999-12-31");

    const rows = await (
      await col("user_daily")
    )
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
    const row = rows[0] ?? { messages: 0, voice_seconds: 0 };
    return {
      messages: Number(row.messages ?? 0),
      voice_seconds: Number(row.voice_seconds ?? 0),
    };
  }

  async function getGuildSettings(guild_id) {
    return (await col("guild_settings")).findOne(
      { guild_id },
      { projection: { _id: 0 } }
    );
  }

  async function upsertActivityMeta({
    guild_id,
    activity_name,
    image_url = null,
    application_id = null,
  }) {
    if (!guild_id || !activity_name) return;
    const set = { updated_at_ms: Date.now() };
    if (image_url) set.image_url = image_url;
    if (application_id) set.application_id = application_id;

    await (
      await col("activity_meta")
    ).updateOne(
      { guild_id, activity_name },
      {
        $set: set,
        $setOnInsert: { guild_id, activity_name, created_at_ms: Date.now() },
      },
      { upsert: true }
    );
  }

  async function getActivityMetaMap(guild_id, activityNames) {
    const names = [...new Set((activityNames ?? []).filter(Boolean))];
    if (!names.length) return {};

    const rows = await (
      await col("activity_meta")
    )
      .find({ guild_id, activity_name: { $in: names } })
      .project({ _id: 0, activity_name: 1, image_url: 1, application_id: 1 })
      .toArray();

    const map = {};
    for (const row of rows) {
      map[row.activity_name] = {
        image_url: row.image_url ?? null,
        application_id: row.application_id ?? null,
      };
    }
    return map;
  }

  async function getGuildSettingsUpdatedAt(guild_id) {
    const doc = await (
      await col("guild_settings")
    ).findOne({ guild_id }, { projection: { updated_at_ms: 1 } });
    return doc?.updated_at_ms ?? null;
  }

  async function ensureGuildSettings(guild_id) {
    await (
      await col("guild_settings")
    ).updateOne(
      { guild_id },
      { $setOnInsert: { guild_id, created_at_ms: Date.now() } },
      { upsert: true }
    );
    await (
      await col("guild_subscriptions")
    ).updateOne(
      { guild_id },
      { $setOnInsert: { guild_id, plan: "free", status: "active", updated_at_ms: Date.now() } },
      { upsert: true }
    );
  }

  async function updateGuildSettings(guild_id, patch) {
    const { guild_id: _drop, _id, ...rest } = patch ?? {};
    await (
      await col("guild_settings")
    ).updateOne(
      { guild_id },
      {
        $set: { ...rest, updated_at_ms: Date.now() },
        $setOnInsert: { guild_id, created_at_ms: Date.now() },
      },
      { upsert: true }
    );
  }

  async function getGuildSubscription(guild_id) {
    return (await col("guild_subscriptions")).findOne({ guild_id });
  }

  async function getGuildSubscriptionByStripeSubscriptionId(stripe_subscription_id) {
    if (!stripe_subscription_id) return null;
    return (await col("guild_subscriptions")).findOne({ stripe_subscription_id });
  }

  async function setGuildSubscription(guild_id, data) {
    await (
      await col("guild_subscriptions")
    ).updateOne(
      { guild_id },
      {
        $set: { ...data, updated_at_ms: Date.now() },
        $setOnInsert: { guild_id },
      },
      { upsert: true }
    );
  }

  async function listGuildSettingsIds() {
    return (await col("guild_settings")).distinct("guild_id");
  }

  return {
    init,
    utcDayString,
    incUserMsg,
    incChannelMsg,
    addUserVoice,
    addChannelVoice,
    upsertSession,
    getSession,
    deleteSession,
    listSessionsForGuild,
    ongoingUserVoiceSeconds,
    ongoingChannelVoiceSeconds,
    sumUserRange,
    sumUserAllTime,
    sumGuildAllTime,
    sumChannelRange,
    seriesUserRange,
    seriesChannelRange,
    firstUserDay,
    firstChannelDay,
    topUserMessagesRange,
    topUserVoiceRange,
    logMemberJoin,
    countMemberJoinsBetween,
    logBoostStart,
    listBoostStartsBetween,
    getBalance,
    addBalance,
    trySubtractBalance,
    applyDailyClaim,
    upsertActivitySession,
    getActivitySession,
    deleteActivitySession,
    listActivitySessionsForGuild,
    addActivitySeconds,
    countActivitiesForGuild,
    topActivitiesForGuild,
    topActivitiesForUser,
    sumUserAllTimeSince,
    sumGuildAllTimeSince,
    upsertActivityMeta,
    getActivityMetaMap,
    getGuildSettings,
    getGuildSettingsUpdatedAt,
    ensureGuildSettings,
    updateGuildSettings,
    getGuildSubscription,
    getGuildSubscriptionByStripeSubscriptionId,
    setGuildSubscription,
    listGuildSettingsIds,
    getDb,
    getMongoClient,
  };
})();
