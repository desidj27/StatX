/**
 * List boost_events (with _id for delete-boost.js).
 * Usage: node scripts/list-boosts.js [guildId]
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const guildId = process.argv[2] ?? process.env.GUILD_ID ?? null;
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db(process.env.MONGODB_DB ?? "degeneratebot").collection("boost_events");

const filter = guildId ? { guild_id: guildId } : {};
const rows = await col.find(filter).sort({ boosted_at_ms: -1 }).toArray();

for (const r of rows) {
  console.log(
    `${r._id}  user=${r.user_id}  guild=${r.guild_id}  ${new Date(r.boosted_at_ms).toISOString()}`
  );
}
console.log(`Total: ${rows.length}`);
await client.close();
