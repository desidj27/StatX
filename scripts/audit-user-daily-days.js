/**
 * Find user_daily documents whose `day` is not YYYY-MM-DD.
 * Usage: node scripts/audit-user-daily-days.js [--delete]
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const uri = (process.env.MONGODB_URI ?? process.env.MONGO_URI)?.trim();
const dbName = process.env.MONGODB_DB ?? "degeneratebot";
const doDelete = process.argv.includes("--delete");

if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const col = client.db(dbName).collection("user_daily");

const bad = await col.find({ day: { $not: { $regex: DAY_RE } } }).limit(50).toArray();
console.log(`Invalid day documents (sample up to 50): ${bad.length}`);
for (const r of bad) {
  console.log(
    `  day=${JSON.stringify(r.day)} guild=${r.guild_id} user=${r.user_id} msgs=${r.messages} voice=${r.voice_seconds}`
  );
}

const latestValid = await col
  .find({ day: { $regex: DAY_RE } })
  .sort({ day: -1 })
  .limit(1)
  .toArray();
console.log(`Latest valid day: ${latestValid[0]?.day ?? "(none)"}`);

if (doDelete && bad.length > 0) {
  const res = await col.deleteMany({ day: { $not: { $regex: DAY_RE } } });
  console.log(`Deleted ${res.deletedCount} invalid documents`);
}

await client.close();
