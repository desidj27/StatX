import { NextResponse } from "next/server";
import { requireGuildAdmin } from "@/lib/auth.js";
import { createGuildCheckoutSession, stripeConfigured } from "@/lib/stripe.js";

const INTERVALS = new Set(["monthly", "quarterly", "yearly"]);

export async function POST(request, { params }) {
  const { guildId } = await params;
  const auth = await requireGuildAdmin(guildId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const interval = body.interval;
  if (!INTERVALS.has(interval)) {
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
  }

  try {
    const session = await createGuildCheckoutSession({
      guildId,
      guildName: auth.guild?.name,
      interval,
      userId: auth.session.user.id,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout create error:", err);
    return NextResponse.json(
      { error: err.message || "checkout_failed" },
      { status: 500 }
    );
  }
}
