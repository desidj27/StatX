import "dotenv/config";
import { MongoClient } from "mongodb";

const guildId = process.argv[2] ?? "890999276367409202";
const minMsgs = Number(process.argv[3] ?? 2400);
const maxMsgs = Number(process.argv[4] ?? 2600);

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const rows = await client
  .db(process.env.MONGODB_DB ?? "degeneratebot")
  .collection("user_daily")
  .aggregate([
    {
      $match: {
        guild_id: guildId,
        day: { $gte: "2026-01-01", $regex: /^\d{4}-\d{2}-\d{2}$/ },
      },
    },
    {
      $group: {
        _id: "$user_id",
        messages: { $sum: "$messages" },
        voice_seconds: { $sum: "$voice_seconds" },
      },
    },
    { $match: { messages: { $gte: minMsgs, $lte: maxMsgs } } },
    { $sort: { voice_seconds: -1 } },
    { $limit: 10 },
  ])
  .toArray();

for (const r of rows) {
  const h = Math.round(r.voice_seconds / 3600);
  console.log(`${r._id}  msgs=${r.messages}  voice=${h}h`);
}
await client.close();
