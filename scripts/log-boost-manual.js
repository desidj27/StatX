/**
 * Backfill one boost event (e.g. missed while bot was down).
 * Usage: node scripts/log-boost-manual.js <guildId> <userId> [boostedAtMs]
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const guildId = process.argv[2];
const userId = process.argv[3];
const boostedAtMs = Number(process.argv[4] ?? Date.now());

if (!guildId || !userId) {
  console.error("Usage: node scripts/log-boost-manual.js <guildId> <userId> [boostedAtMs]");
  process.exit(1);
}

const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
const dbName = process.env.MONGODB_DB ?? "degeneratebot";
const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection("boost_events");

await col.insertOne({ guild_id: guildId, user_id: userId, boosted_at_ms: boostedAtMs });

console.log("Inserted boost:", { guildId, userId, boostedAtMs });
console.log("As UTC:", new Date(boostedAtMs).toISOString());
console.log(
  "Dashboard 'Last 7 days' only shows boosts within the last week from today."
);

const inRange = await col.countDocuments({
  guild_id: guildId,
  boosted_at_ms: { $gte: Date.now() - 7 * 24 * 60 * 60 * 1000 },
});
console.log(`Boosts for this guild in last 7 days: ${inRange}`);

await client.close();
