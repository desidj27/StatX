import { NextResponse } from "next/server";
import { requireGuildAdmin } from "@/lib/auth.js";
import { preferLocalActivityIcon } from "@/lib/activity-icons.js";
import { resolveMemberProfiles } from "@/lib/discord.js";
import {
  resolveActivityApplicationId,
  resolveActivityIconUrl,
} from "../../../../../../src/activity-meta.js";
import { applyPlanToRange } from "../../../../../../src/plan.js";
import { resolveRange } from "../../../../../../src/periods.js";
import { getGuildSettings } from "../../../../../../src/guild-settings.js";
import { DB } from "../../../../../../src/db.js";
import { getGuildPlanInfo, getGuildRankings } from "../../../../../../src/dashboard-data.js";

export async function GET(request, { params }) {
  const { guildId } = await params;
  const auth = await requireGuildAdmin(guildId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "all";
  const messagesPage = Math.max(0, Number(url.searchParams.get("messagesPage") ?? 0) || 0);
  const voicePage = Math.max(0, Number(url.searchParams.get("voicePage") ?? 0) || 0);
  const gamesPage = Math.max(0, Number(url.searchParams.get("gamesPage") ?? 0) || 0);

  try {
    const settings = await getGuildSettings(guildId);
    let range = resolveRange({ period, timeZone: settings.timezone });
    range = await applyPlanToRange(guildId, range, settings.timezone);

    const [rankings, plan] = await Promise.all([
      getGuildRankings(guildId, {
        startDay: range.start,
        endDay: range.end,
        messagesPage,
        voicePage,
        gamesPage,
      }),
      getGuildPlanInfo(guildId),
    ]);

    const userIds = [
      ...rankings.messages.items.map((r) => r.user_id),
      ...rankings.voice.items.map((r) => r.user_id),
    ];
    const activityNames = rankings.games.items.map((g) => g.activity_name);
    const [profiles, activityIcons] = await Promise.all([
      resolveMemberProfiles(guildId, userIds),
      DB.getActivityMetaMap(guildId, activityNames),
    ]);

    rankings.games.items = rankings.games.items.map((game) => {
      const meta = activityIcons[game.activity_name];
      const application_id = resolveActivityApplicationId(
        game.activity_name,
        meta?.application_id
      );
      const image_url = preferLocalActivityIcon(
        game.activity_name,
        resolveActivityIconUrl({
          activity_name: game.activity_name,
          application_id,
          stored_image_url: meta?.image_url ?? null,
        })
      );
      return { ...game, image_url, application_id };
    });

    return NextResponse.json({
      range,
      plan,
      profiles,
      activityIcons,
      ...rankings,
    });
  } catch (err) {
    console.error("rankings error:", err);
    return NextResponse.json({ error: "rankings_unavailable" }, { status: 500 });
  }
}
