import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const userId = process.argv[2] ?? "229349039089385473";
const guildId = process.argv[3] ?? "890999276367409202";
const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "stats.sqlite");

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
db.all(
  `SELECT day, messages, voice_seconds FROM user_daily
   WHERE guild_id = ? AND user_id = ? AND day GLOB '????-??-??'
   ORDER BY day DESC LIMIT 40`,
  [guildId, userId],
  (err, rows) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log(`SQLite rows for ${userId}: ${rows.length}`);
    for (const r of rows) {
      console.log(`  ${r.day}  msgs=${r.messages}  voice=${r.voice_seconds}s`);
    }
    db.close();
  }
);
