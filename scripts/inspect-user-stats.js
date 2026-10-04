/**
 * Compare per-day stats for a user in Mongo (and optional SQLite).
 * Usage: node scripts/inspect-user-stats.js <userId> [guildId]
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const userId = process.argv[2];
const guildId = process.argv[3] ?? "890999276367409202";
if (!userId) {
  console.error("Usage: node scripts/inspect-user-stats.js <userId>");
  process.exit(1);
}

const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
const dbName = process.env.MONGODB_DB ?? "degeneratebot";
const SQLITE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "stats.sqlite");

const client = new MongoClient(uri);
await client.connect();
const col = client.db(dbName).collection("user_daily");

const totals = await col
  .aggregate([
    {
      $match: {
        guild_id: guildId,
        user_id: userId,
        day: { $gte: "2026-01-01", $lte: "2026-12-31", $regex: /^\d{4}-\d{2}-\d{2}$/ },
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

console.log("Mongo 2026 totals:", totals[0] ?? { messages: 0, voice_seconds: 0 });

for (const month of ["2026-04", "2026-05", "2026-06"]) {
  const rows = await col
    .find({
      guild_id: guildId,
      user_id: userId,
      day: { $regex: `^${month}` },
    })
    .sort({ day: 1 })
    .toArray();
  const msgs = rows.reduce((s, r) => s + (r.messages ?? 0), 0);
  const voice = rows.reduce((s, r) => s + (r.voice_seconds ?? 0), 0);
  const last = rows[rows.length - 1]?.day;
  const first = rows[0]?.day;
  console.log(
    `${month}: ${rows.length} days, msgs=${msgs}, voice=${Math.round(voice / 3600)}h, range=${first ?? "-"}..${last ?? "-"}`
  );
}

const last10 = await col
  .find({ guild_id: guildId, user_id: userId, day: { $regex: /^\d{4}-\d{2}-\d{2}$/ } })
  .sort({ day: -1 })
  .limit(10)
  .toArray();
console.log("Mongo last 10 days with activity:");
for (const r of last10) {
  if (r.messages || r.voice_seconds) {
    console.log(`  ${r.day}  msgs=${r.messages}  voice=${r.voice_seconds}s`);
  }
}

try {
  const db = new sqlite3.Database(SQLITE_PATH);
  const all = (sql, p = []) =>
    new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
  const sq = await all(
    `SELECT day, messages, voice_seconds FROM user_daily
     WHERE guild_id = ? AND user_id = ? AND day GLOB '????-??-??'
     ORDER BY day DESC LIMIT 10`,
    [guildId, userId]
  );
  console.log("SQLite last 10 days:");
  for (const r of sq) console.log(`  ${r.day}  msgs=${r.messages}  voice=${r.voice_seconds}s`);
  db.close();
} catch (err) {
  console.log("SQLite:", err?.code ?? err?.message);
}

await client.close();
