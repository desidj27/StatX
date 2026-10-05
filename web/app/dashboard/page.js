import { redirect } from "next/navigation";
import { getSession } from "@/lib/session.js";
import { botIsInGuild } from "@/lib/discord.js";
import { getSessionGuilds } from "@/lib/auth.js";
import AppNavbar from "@/components/AppNavbar.js";
import GuildGrid from "@/components/GuildGrid.js";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.user) redirect("/");

  const adminGuilds = await getSessionGuilds(session, { persist: true });

  const presence = await Promise.all(
    adminGuilds.map(async (guild) => ({
      guild,
      present: await botIsInGuild(guild.id),
    }))
  );
  const manageable = presence
    .filter((row) => row.present)
    .map((row) => row.guild)
    .sort((a, b) => a.name.localeCompare(b.name));

  const clientId = process.env.DISCORD_CLIENT_ID;
  const inviteUrl = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8`
    : null;

  return (
    <main className="min-h-screen bg-background">
      <AppNavbar
        userLabel={session.user.global_name || session.user.username}
      />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">Your servers</h1>
        <p className="mt-1 text-default-500">
          Servers where you are an administrator and the bot is installed.
        </p>
        <GuildGrid guilds={manageable} inviteUrl={inviteUrl} />
      </div>
    </main>
  );
}
