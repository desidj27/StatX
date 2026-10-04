import "dotenv/config";
import { MongoClient } from "mongodb";

const guildId = process.argv[2] ?? "890999276367409202";
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db(process.env.MONGODB_DB ?? "degeneratebot").collection("user_daily");

for (const month of ["2026-03", "2026-04", "2026-05", "2026-06"]) {
  const n = await col.countDocuments({
    guild_id: guildId,
    day: { $regex: `^${month}` },
  });
  const users = await col.distinct("user_id", {
    guild_id: guildId,
    day: { $regex: `^${month}` },
  });
  console.log(`${month}: ${n} rows, ${users.length} users`);
}
await client.close();
