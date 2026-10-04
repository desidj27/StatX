/**
 * Insert boosts from boosts-backfill.json (edit user_id fields first).
 * Usage: node scripts/backfill-boosts.js
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { boostMsInNewYork } from "./boost-ms-ny.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "boosts-backfill.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const guildId = config.guild_id;
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db(process.env.MONGODB_DB ?? "degeneratebot").collection("boost_events");

for (const b of config.boosts) {
  if (!b.user_id || b.user_id.startsWith("PASTE_")) {
    console.error(`Skip (set user_id): ${b.note}`);
    continue;
  }

  const boostedAtMs = boostMsInNewYork(b.year, b.month, b.day, b.hour, b.minute);
  const dup = await col.findOne({
    guild_id: guildId,
    user_id: b.user_id,
    boosted_at_ms: boostedAtMs,
  });
  if (dup) {
    console.log(`Already exists: ${b.note}`);
    continue;
  }

  await col.insertOne({
    guild_id: guildId,
    user_id: b.user_id,
    boosted_at_ms: boostedAtMs,
  });
  console.log(`Logged: ${b.note}`);
  console.log(`  user_id=${b.user_id}  ${new Date(boostedAtMs).toISOString()}`);
}

await client.close();
console.log("Done.");
