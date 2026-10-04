import { NextResponse } from "next/server";
import { fetchGuildSummaries } from "@/lib/discord.js";
import { requirePlatformAdmin } from "@/lib/platform-admin.js";
import { listAdminGuilds } from "../../../../../src/admin-data.js";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const guilds = await listAdminGuilds();
    const summaries = await fetchGuildSummaries(guilds.map((g) => g.guild_id));

    const items = guilds.map((g) => ({
      ...g,
      name: summaries[g.guild_id]?.name ?? g.guild_id,
      icon: summaries[g.guild_id]?.icon ?? null,
      bot_present: summaries[g.guild_id]?.bot_present ?? false,
    }));

    items.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ guilds: items });
  } catch (err) {
    console.error("admin guilds error:", err);
    return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  }
}
