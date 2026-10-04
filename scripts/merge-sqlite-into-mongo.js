/**
 * Merge stats.sqlite into MongoDB (upsert, keeps higher counts per day).
 * Use when the first migration skipped collections or SQLite has more complete history.
 *
 * Usage:
 *   node scripts/merge-sqlite-into-mongo.js
 *   node scripts/merge-sqlite-into-mongo.js --dry-run
 */
import "dotenv/config";
import sqlite3 from "sqlite3";
import { MongoClient } from "mongodb";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(__dirname, "..", "stats.sqlite");

function openSqlite(file) {
  const db = new sqlite3.Database(file);
  const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  const close = () =>
    new Promise((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });
  return { all, close };
}

const CALENDAR_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function mergeUserDaily(collection, rows, dryRun) {
  const valid = rows.filter((row) => CALENDAR_DAY_RE.test(row.day));
  const skipped = rows.length - valid.length;
  if (skipped > 0) {
    console.warn(`user_daily: skipping ${skipped} rows with invalid day`);
  }
  if (valid.length === 0) return 0;
  const ops = valid.map((row) => ({
    updateOne: {
      filter: {
        guild_id: row.guild_id,
        user_id: row.user_id,
        day: row.day,
      },
      update: {
        $setOnInsert: {
          guild_id: row.guild_id,
          user_id: row.user_id,
          day: row.day,
        },
        $max: {
          messages: Number(row.messages ?? 0),
          voice_seconds: Number(row.voice_seconds ?? 0),
        },
      },
      upsert: true,
    },
  }));
  if (dryRun) return ops.length;
  const res = await collection.bulkWrite(ops, { ordered: false });
  return res.upsertedCount + res.modifiedCount + res.matchedCount;
}

async function mergeChannelDaily(collection, rows, dryRun) {
  const valid = rows.filter((row) => CALENDAR_DAY_RE.test(row.day));
  const skipped = rows.length - valid.length;
  if (skipped > 0) {
    console.warn(`channel_daily: skipping ${skipped} rows with invalid day`);
  }
  if (valid.length === 0) return 0;
  const ops = valid.map((row) => ({
    updateOne: {
      filter: {
        guild_id: row.guild_id,
        channel_id: row.channel_id,
        day: row.day,
      },
      update: {
        $setOnInsert: {
          guild_id: row.guild_id,
          channel_id: row.channel_id,
          day: row.day,
        },
        $max: {
          messages: Number(row.messages ?? 0),
          voice_seconds: Number(row.voice_seconds ?? 0),
        },
      },
      upsert: true,
    },
  }));
  if (dryRun) return ops.length;
  const res = await collection.bulkWrite(ops, { ordered: false });
  return res.upsertedCount + res.modifiedCount + res.matchedCount;
}

async function mergeSimpleInsert(collection, rows, dryRun) {
  if (rows.length === 0) return 0;
  if (dryRun) return rows.length;
  try {
    const res = await collection.insertMany(rows, { ordered: false });
    return res.insertedCount;
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return 0;
  }
}

async function mergeEconomy(collection, rows, dryRun) {
  if (rows.length === 0) return 0;
  const ops = rows.map((row) => ({
    updateOne: {
      filter: { guild_id: row.guild_id, user_id: row.user_id },
      update: {
        $setOnInsert: {
          guild_id: row.guild_id,
          user_id: row.user_id,
          balance: Number(row.balance ?? 0),
          last_daily_claim_ms: row.last_daily_claim_ms ?? null,
          daily_streak: Number(row.daily_streak ?? 0),
        },
      },
      upsert: true,
    },
  }));
  if (dryRun) return ops.length;
  const res = await collection.bulkWrite(ops, { ordered: false });
  return res.upsertedCount + res.modifiedCount;
}

async function mergeActivityTotals(collection, rows, dryRun) {
  if (rows.length === 0) return 0;
  const ops = rows.map((row) => ({
    updateOne: {
      filter: {
        guild_id: row.guild_id,
        user_id: row.user_id,
        activity_name: row.activity_name,
      },
      update: {
        $setOnInsert: {
          guild_id: row.guild_id,
          user_id: row.user_id,
          activity_name: row.activity_name,
        },
        $max: { total_seconds: Number(row.total_seconds ?? 0) },
      },
      upsert: true,
    },
  }));
  if (dryRun) return ops.length;
  const res = await collection.bulkWrite(ops, { ordered: false });
  return res.upsertedCount + res.modifiedCount;
}

async function main() {
  const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
  if (!uri) {
    console.error("Set MONGODB_URI in .env");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "degeneratebot";
  const dryRun = process.argv.includes("--dry-run");

  const sqlite = openSqlite(SQLITE_PATH);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`MongoDB: ${dbName}${dryRun ? " (dry run)" : ""}`);

  const userRows = await sqlite.all(`SELECT * FROM user_daily`);
  const channelRows = await sqlite.all(`SELECT * FROM channel_daily`);
  const economyRows = await sqlite.all(`SELECT * FROM economy_balances`);
  const activityRows = await sqlite.all(`SELECT * FROM activity_totals`);

  const n1 = await mergeUserDaily(db.collection("user_daily"), userRows, dryRun);
  const n2 = await mergeChannelDaily(db.collection("channel_daily"), channelRows, dryRun);
  const n3 = await mergeEconomy(db.collection("economy_balances"), economyRows, dryRun);
  const n4 = await mergeActivityTotals(
    db.collection("activity_totals"),
    activityRows,
    dryRun
  );

  for (const [table, mergeFn] of [
    ["member_joins", mergeSimpleInsert],
    ["boost_events", mergeSimpleInsert],
    ["voice_sessions", mergeSimpleInsert],
    ["activity_sessions", mergeSimpleInsert],
  ]) {
    const rows = await sqlite.all(`SELECT * FROM ${table}`);
    const n = await mergeFn(db.collection(table), rows, dryRun);
    console.log(`${table}: ${n} ops/rows`);
  }

  console.log(`user_daily: ${n1} ops/rows`);
  console.log(`channel_daily: ${n2} ops/rows`);
  console.log(`economy_balances: ${n3} ops/rows`);
  console.log(`activity_totals: ${n4} ops/rows`);

  const latest = await db
    .collection("user_daily")
    .find()
    .sort({ day: -1 })
    .limit(1)
    .toArray();
  console.log(
    `Latest user_daily day in Mongo after merge: ${latest[0]?.day ?? "(none)"}`
  );

  await sqlite.close();
  await client.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
