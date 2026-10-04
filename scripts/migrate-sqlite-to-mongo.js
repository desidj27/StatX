/**
 * One-time migration: stats.sqlite → MongoDB
 * Usage: node scripts/migrate-sqlite-to-mongo.js
 * Requires MONGODB_URI (and optional MONGODB_DB) in .env
 */
import "dotenv/config";
import sqlite3 from "sqlite3";
import { MongoClient } from "mongodb";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = path.join(__dirname, "..", "stats.sqlite");

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

function filterCalendarDays(rows, label) {
  const valid = rows.filter((r) => CALENDAR_DAY_RE.test(r.day));
  const skipped = rows.length - valid.length;
  if (skipped > 0) {
    console.warn(`${label}: skipping ${skipped} rows with invalid day`);
  }
  return valid;
}

async function bulkInsert(collection, docs, batchSize = 500) {
  if (docs.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const res = await collection.insertMany(batch, { ordered: false });
    inserted += res.insertedCount;
  }
  return inserted;
}

function redactUri(uri) {
  try {
    const u = new URL(uri.replace(/^mongodb\+srv:/, "https:").replace(/^mongodb:/, "http:"));
    return `${u.protocol}//${u.username ? "***:***@" : ""}${u.host}${u.pathname}${u.search}`;
  } catch {
    return "(invalid URI)";
  }
}

async function main() {
  const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
  if (!uri) {
    console.error("Set MONGODB_URI in .env (not MONGO_URI alone — or use either name)");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "degeneratebot";
  const force = process.argv.includes("--force");

  console.log(`Target: ${redactUri(uri)}`);
  console.log(`Database: ${dbName}`);
  if (force) console.log("Mode: --force (clear collections before import)");

  const sqlite = openSqlite(SQLITE_PATH);
  const client = new MongoClient(uri);
  await client.connect();
  console.log("Connected to MongoDB");
  const db = client.db(dbName);

  const tables = [
    { sqlite: "user_daily", mongo: "user_daily" },
    { sqlite: "channel_daily", mongo: "channel_daily" },
    { sqlite: "voice_sessions", mongo: "voice_sessions" },
    { sqlite: "member_joins", mongo: "member_joins" },
    { sqlite: "boost_events", mongo: "boost_events" },
    { sqlite: "economy_balances", mongo: "economy_balances" },
    { sqlite: "activity_sessions", mongo: "activity_sessions" },
    { sqlite: "activity_totals", mongo: "activity_totals" },
  ];

  if (force) {
    for (const { mongo } of tables) {
      const existing = await db.collection(mongo).estimatedDocumentCount();
      if (existing > 0) {
        await db.collection(mongo).deleteMany({});
        console.log(`Cleared ${mongo} (${existing} documents)`);
      }
    }
  }

  console.log(
    force
      ? "Importing from SQLite (full replace)..."
      : "Mongo already has data? Run: npm run merge:mongo (merges without wiping)."
  );

  for (const { sqlite: table, mongo } of tables) {
    let rows = await sqlite.all(`SELECT * FROM ${table}`);
    if (mongo === "user_daily" || mongo === "channel_daily") {
      rows = filterCalendarDays(rows, mongo);
    }
    const collection = db.collection(mongo);
    const existing = await collection.estimatedDocumentCount();
    if (!force && existing > 0) {
      console.log(
        `Skip ${mongo}: ${existing} documents already (use --force to wipe, or npm run merge:mongo)`
      );
      continue;
    }
    const count = await bulkInsert(collection, rows);
    console.log(`Migrated ${mongo}: ${count} documents`);
  }

  await sqlite.close();
  await client.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
