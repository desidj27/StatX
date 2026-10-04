/**
 * Delete all bot stats data (MongoDB + optional local stats.sqlite).
 *
 * Usage:
 *   node scripts/wipe-all-data.js --confirm
 *   node scripts/wipe-all-data.js --confirm --keep-sqlite
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COLLECTIONS = [
  "user_daily",
  "channel_daily",
  "voice_sessions",
  "member_joins",
  "boost_events",
  "economy_balances",
  "activity_sessions",
  "activity_totals",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function redactUri(uri) {
  try {
    const u = new URL(uri.replace(/^mongodb\+srv:/, "https:").replace(/^mongodb:/, "http:"));
    return `${u.hostname} / ${process.env.MONGODB_DB ?? "degeneratebot"}`;
  } catch {
    return "(mongodb)";
  }
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("This permanently deletes all stats. Re-run with: --confirm");
    process.exit(1);
  }

  const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
  if (!uri) {
    console.error("Set MONGODB_URI in .env");
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB ?? "degeneratebot";
  const keepSqlite = process.argv.includes("--keep-sqlite");

  console.log(`Wiping MongoDB: ${redactUri(uri)}`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const before = await col.estimatedDocumentCount();
    const res = await col.deleteMany({});
    console.log(`${name}: deleted ${res.deletedCount} (was ~${before})`);
  }

  await client.close();
  console.log("MongoDB wipe complete.");

  if (!keepSqlite) {
    for (const file of ["stats.sqlite", "stats.sqlite-wal", "stats.sqlite-shm"]) {
      const p = path.join(ROOT, file);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`Removed ${file}`);
      }
    }
  } else {
    console.log("Kept local stats.sqlite files (--keep-sqlite).");
  }

  console.log("Done. Restart the bot to begin recording from zero.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
