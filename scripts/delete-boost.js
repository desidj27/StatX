/**
 * Delete one boost_events row by MongoDB _id.
 * List ids: node scripts/list-boosts.js [guildId]
 *
 * Usage: node scripts/delete-boost.js <mongoObjectId>
 */
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const id = process.argv[2];
if (!id) {
  console.error("Usage: node scripts/delete-boost.js <mongoObjectId>");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db(process.env.MONGODB_DB ?? "degeneratebot").collection("boost_events");

const res = await col.deleteOne({ _id: new ObjectId(id) });
if (res.deletedCount === 0) {
  console.error("No row found with that id.");
  process.exit(1);
}
console.log("Deleted boost_events row:", id);
await client.close();
