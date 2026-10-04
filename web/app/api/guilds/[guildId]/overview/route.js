import { NextResponse } from "next/server";
import { requireGuildAdmin } from "@/lib/auth.js";
import {
  getGuildOverview,
  getGuildPlanInfo,
  guildDailySeries,
  topChannels,
  topUsersByMessages,
} from "../../../../../../src/dashboard-data.js";

export async function GET(_request, { params }) {
  const { guildId } = await params;
  const auth = await requireGuildAdmin(guildId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [overview, plan, series, users, channels] = await Promise.all([
      getGuildOverview(guildId),
      getGuildPlanInfo(guildId),
      guildDailySeries(guildId, 30),
      topUsersByMessages(guildId, 10),
      topChannels(guildId, 10),
    ]);

    return NextResponse.json({ overview, plan, series, users, channels });
  } catch (err) {
    console.error("overview error:", err);
    return NextResponse.json({ error: "stats_unavailable" }, { status: 500 });
  }
}
