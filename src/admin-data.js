import { getDb } from "./db/mongo.js";
import { listGuilds } from "./dashboard-data.js";

export async function listAdminGuilds() {
  const db = await getDb();

  const ids = new Set(await listGuilds());
  for (const id of await db.collection("guild_settings").distinct("guild_id")) {
    ids.add(id);
  }
  for (const id of await db.collection("guild_subscriptions").distinct("guild_id")) {
    ids.add(id);
  }

  const subs = await db
    .collection("guild_subscriptions")
    .find({})
    .project({ _id: 0 })
    .toArray();
  const subByGuild = new Map(subs.map((s) => [s.guild_id, s]));

  const settings = await db
    .collection("guild_settings")
    .find({ guild_id: { $in: [...ids] } })
    .project({ _id: 0, guild_id: 1, updated_at_ms: 1 })
    .toArray();
  const settingsByGuild = new Map(settings.map((s) => [s.guild_id, s]));

  return [...ids]
    .sort()
    .map((guild_id) => {
      const sub = subByGuild.get(guild_id);
      const plan = sub?.plan === "premium" && sub?.status !== "canceled" ? "premium" : "free";
      return {
        guild_id,
        plan,
        status: sub?.status ?? "active",
        subscription_updated_at_ms: sub?.updated_at_ms ?? null,
        settings_updated_at_ms: settingsByGuild.get(guild_id)?.updated_at_ms ?? null,
      };
    });
}
