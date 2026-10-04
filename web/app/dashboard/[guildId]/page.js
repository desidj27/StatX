import { redirect } from "next/navigation";
import { getSession } from "@/lib/session.js";
import { botIsInGuild } from "@/lib/discord.js";
import { getSessionGuilds } from "@/lib/auth.js";
import AppNavbar from "@/components/AppNavbar.js";
import GuildDashboard from "@/components/GuildDashboard.js";

export default async function GuildPage({ params }) {
  const session = await getSession();
  if (!session.user) redirect("/");

  const { guildId } = await params;
  const guilds = await getSessionGuilds(session);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) redirect("/dashboard");
  if (!(await botIsInGuild(guildId))) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-background">
      <AppNavbar
        title={guild.name}
        backHref="/dashboard"
        userLabel={session.user.global_name || session.user.username}
      />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <GuildDashboard guildId={guildId} guildName={guild.name} />
      </div>
    </main>
  );
}
