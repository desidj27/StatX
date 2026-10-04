/**
 * Fix boosted_at_ms on an existing boost_events row.
 * Usage: node scripts/fix-boost-timestamp.js <guildId> <userId> <newBoostedAtMs>
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const guildId = process.argv[2];
const userId = process.argv[3];
const newMs = Number(process.argv[4]);

if (!guildId || !userId || !newMs) {
  console.error(
    "Usage: node scripts/fix-boost-timestamp.js <guildId> <userId> <newBoostedAtMs>"
  );
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db(process.env.MONGODB_DB ?? "degeneratebot").collection("boost_events");

const res = await col.updateMany(
  { guild_id: guildId, user_id: userId },
  { $set: { boosted_at_ms: newMs } }
);

console.log(`Updated ${res.modifiedCount} row(s) → ${new Date(newMs).toISOString()}`);

const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
const inRange = await col.countDocuments({
  guild_id: guildId,
  boosted_at_ms: { $gte: weekAgo },
});
console.log(`Boosts in last 7 days for guild: ${inRange}`);

await client.close();
