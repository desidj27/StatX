import { NextResponse } from "next/server";
import { requireGuildAdmin } from "@/lib/auth.js";
import { DB } from "../../../../../../src/db.js";
import { stripeConfigured } from "@/lib/stripe.js";

export async function GET(_request, { params }) {
  const { guildId } = await params;
  const auth = await requireGuildAdmin(guildId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const sub = await DB.getGuildSubscription(guildId);
    const plan =
      sub?.plan === "premium" && sub?.status !== "canceled" ? "premium" : "free";

    return NextResponse.json({
      plan,
      status: sub?.status ?? "active",
      interval: sub?.billing_interval ?? null,
      stripe_configured: stripeConfigured(),
      updated_at_ms: sub?.updated_at_ms ?? null,
    });
  } catch (err) {
    console.error("plan GET error:", err);
    return NextResponse.json({ error: "plan_unavailable" }, { status: 500 });
  }
}
