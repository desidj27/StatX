/**
 * Quick sanity check for MongoDB stats data.
 * Usage: node scripts/verify-mongo-data.js [guildId] [userId]
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
const dbName = process.env.MONGODB_DB ?? "degeneratebot";
const guildId = process.argv[2] ?? process.env.GUILD_ID;
const userId = process.argv[3];

if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const userDaily = await db.collection("user_daily").estimatedDocumentCount();
const channelDaily = await db.collection("channel_daily").estimatedDocumentCount();
console.log(`user_daily documents: ${userDaily}`);
console.log(`channel_daily documents: ${channelDaily}`);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const globalLatest = await db
  .collection("user_daily")
  .find({ day: { $regex: DAY_RE } })
  .sort({ day: -1 })
  .limit(1)
  .toArray();
console.log(`Latest valid day in user_daily: ${globalLatest[0]?.day ?? "(none)"}`);

const badCount = await db.collection("user_daily").countDocuments({
  day: { $not: { $regex: DAY_RE } },
});
if (badCount > 0) {
  console.log(
    `Warning: ${badCount} user_daily rows have invalid day (run: node scripts/audit-user-daily-days.js)`
  );
}

if (guildId && userId) {
  const latest = await db
    .collection("user_daily")
    .find({ guild_id: guildId, user_id: userId })
    .sort({ day: -1 })
    .limit(5)
    .toArray();
  console.log(`Last 5 days for user ${userId}:`);
  for (const r of latest) {
    console.log(
      `  ${r.day}  messages=${r.messages}  voice_seconds=${r.voice_seconds}`
    );
  }

  const byMonth = await db
    .collection("user_daily")
    .aggregate([
      { $match: { guild_id: guildId, user_id: userId } },
      { $group: { _id: { $substr: ["$day", 0, 7] }, messages: { $sum: "$messages" } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  console.log("Messages by month:");
  for (const r of byMonth) {
    console.log(`  ${r._id}: ${r.messages}`);
  }
}

await client.close();
