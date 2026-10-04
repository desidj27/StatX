/**
 * Find guild member Discord IDs by username (partial match).
 * Usage: node scripts/find-member-id.js <guildId> <search>
 */
import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const guildId = process.argv[2];
const search = (process.argv[3] ?? "").toLowerCase();

if (!guildId || !search) {
  console.error("Usage: node scripts/find-member-id.js <guildId> <username>");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

await client.login(process.env.DISCORD_TOKEN);
await client.guilds.fetch(guildId);
const guild = client.guilds.cache.get(guildId);
const members = await guild.members.fetch({ query: search, limit: 20 });

for (const m of members.values()) {
  const name = m.user.username.toLowerCase();
  const display = m.displayName?.toLowerCase() ?? "";
  if (name.includes(search) || display.includes(search)) {
    console.log(`${m.user.username} (${m.displayName}) → ${m.user.id}`);
  }
}

if (members.size === 0) console.log("No members matched. Try a shorter search.");
await client.destroy();
