import { NextResponse } from "next/server";
import { getSessionGuilds, requireUser } from "@/lib/auth.js";
import { botIsInGuild } from "@/lib/discord.js";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const adminGuilds = await getSessionGuilds(auth.session, { persist: true });

  const withBot = [];
  for (const guild of adminGuilds) {
    if (await botIsInGuild(guild.id)) {
      withBot.push({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
      });
    }
  }

  withBot.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ guilds: withBot });
}
