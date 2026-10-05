import { NextResponse } from "next/server";
import { requireGuildAdmin } from "@/lib/auth.js";
import { fetchGuildChannelMap, resolveMemberProfiles } from "@/lib/discord.js";
import { applyPlanToRange } from "../../../../../../src/plan.js";
import { resolveRange } from "../../../../../../src/periods.js";
import { getGuildSettings } from "../../../../../../src/guild-settings.js";
import { getGuildBoard, getGuildPlanInfo } from "../../../../../../src/dashboard-data.js";

const BOARDS = new Set([
  "user-daily",
  "channel-daily",
  "games",
  "voice",
  "joins",
  "economy",
  "boosts",
]);

export async function GET(request, { params }) {
  const { guildId } = await params;
  const auth = await requireGuildAdmin(guildId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const board = url.searchParams.get("board") ?? "";
  if (!BOARDS.has(board)) {
    return NextResponse.json({ error: "invalid_board" }, { status: 400 });
  }

  const period = url.searchParams.get("period") ?? "7d";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);

  try {
    const settings = await getGuildSettings(guildId);
    let range = resolveRange({ period, timeZone: settings.timezone });
    range = await applyPlanToRange(guildId, range, settings.timezone);

    const [data, plan] = await Promise.all([
      getGuildBoard(guildId, board, {
        startDay: range.start,
        endDay: range.end,
        page,
      }),
      getGuildPlanInfo(guildId),
    ]);

    const userIds = data.items
      .map((row) => row.user_id)
      .filter(Boolean);
    const needsChannels = data.items.some((row) => row.channel_id);

    const [profiles, channels] = await Promise.all([
      resolveMemberProfiles(guildId, userIds),
      needsChannels ? fetchGuildChannelMap(guildId) : Promise.resolve({}),
    ]);

    return NextResponse.json({
      range,
      plan,
      profiles,
      channels,
      ...data,
    });
  } catch (err) {
    console.error("boards error:", err);
    return NextResponse.json({ error: "board_unavailable" }, { status: 500 });
  }
}
