import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin.js";
import { DB } from "../../../../../../../src/db.js";
import { invalidatePlanCache } from "../../../../../../../src/plan.js";

export async function PATCH(request, { params }) {
  const auth = await requirePlatformAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { guildId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const plan = body.plan === "premium" ? "premium" : "free";
  const status = body.status === "canceled" ? "canceled" : "active";

  try {
    await DB.setGuildSubscription(guildId, { plan, status });
    invalidatePlanCache(guildId);

    const sub = await DB.getGuildSubscription(guildId);
    const effectivePlan =
      sub?.plan === "premium" && sub?.status !== "canceled" ? "premium" : "free";

    return NextResponse.json({
      guild_id: guildId,
      plan: effectivePlan,
      status: sub?.status ?? status,
      updated_at_ms: sub?.updated_at_ms ?? Date.now(),
    });
  } catch (err) {
    console.error("admin plan update error:", err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
