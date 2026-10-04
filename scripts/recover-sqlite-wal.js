/**
 * Checkpoint WAL so stats.sqlite is safe to copy. Run on the game panel before download.
 * Usage: node scripts/recover-sqlite-wal.js
 */
import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SQLITE_PATH =
  process.env.SQLITE_PATH ??
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "stats.sqlite");

const db = new sqlite3.Database(SQLITE_PATH);
const run = (sql) =>
  new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
const get = (sql) =>
  new Promise((resolve, reject) => {
    db.get(sql, (err, row) => (err ? reject(err) : resolve(row)));
  });

try {
  const check = await get("PRAGMA integrity_check");
  console.log("integrity_check:", check);
  await run("PRAGMA wal_checkpoint(TRUNCATE)");
  console.log("WAL checkpoint complete. Copy only stats.sqlite (not -wal/-shm).");
} catch (err) {
  console.error(err?.message ?? err);
  console.error(
    "Database may be corrupt. Stop the bot, copy stats.sqlite from the panel again, and do not copy -wal/-shm unless copied together."
  );
  process.exit(1);
} finally {
  db.close();
}
