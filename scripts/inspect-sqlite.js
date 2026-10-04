import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "stats.sqlite");
const guildId = process.argv[2] ?? "890999276367409202";
const userId = process.argv[3];

const db = new sqlite3.Database(SQLITE_PATH);
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const latest = await all(
  `SELECT day, COUNT(*) AS c FROM user_daily
   WHERE guild_id = ? AND day GLOB '????-??-??'
   GROUP BY day ORDER BY day DESC LIMIT 15`,
  [guildId]
);
console.log("Latest days in SQLite:");
for (const r of latest) console.log(`  ${r.day}: ${r.c} users`);

for (const month of ["2026-04", "2026-05", "2026-06"]) {
  const [{ n }] = await all(
    `SELECT COUNT(*) AS n FROM user_daily WHERE guild_id = ? AND day LIKE ?`,
    [guildId, `${month}%`]
  );
  console.log(`${month}: ${n} rows`);
}

if (userId) {
  const rows = await all(
    `SELECT day, messages, voice_seconds FROM user_daily
     WHERE guild_id = ? AND user_id = ? AND day GLOB '????-??-??'
     ORDER BY day DESC LIMIT 20`,
    [guildId, userId]
  );
  console.log(`Last 20 days for user ${userId}:`);
  for (const r of rows) {
    console.log(`  ${r.day}  msgs=${r.messages}  voice=${r.voice_seconds}s`);
  }
}

db.close();
