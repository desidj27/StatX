import { NextResponse } from "next/server";
import { DB } from "../../../../../src/db.js";
import { invalidatePlanCache } from "../../../../../src/plan.js";
import {
  getStripe,
  subscriptionIsPremium,
} from "@/lib/stripe.js";

export const runtime = "nodejs";

async function activatePremium(guildId, extra = {}) {
  if (!guildId) return;
  await DB.setGuildSubscription(guildId, {
    plan: "premium",
    status: "active",
    ...extra,
  });
  invalidatePlanCache(guildId);
}

async function deactivatePremium(guildId, extra = {}) {
  if (!guildId) return;
  await DB.setGuildSubscription(guildId, {
    plan: "free",
    status: "canceled",
    ...extra,
  });
  invalidatePlanCache(guildId);
}

async function syncSubscription(subscription) {
  const guildId =
    subscription.metadata?.guild_id ||
    (
      await DB.getGuildSubscriptionByStripeSubscriptionId(subscription.id)
    )?.guild_id;

  if (!guildId) {
    console.warn("stripe webhook: no guild for subscription", subscription.id);
    return;
  }

  const premium = subscriptionIsPremium(subscription.status);
  if (premium) {
    await activatePremium(guildId, {
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id,
      stripe_subscription_id: subscription.id,
      billing_interval: subscription.metadata?.interval ?? null,
    });
  } else {
    await deactivatePremium(guildId, {
      stripe_subscription_id: subscription.id,
    });
  }
}

export async function POST(request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe webhook signature error:", err.message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const guildId = session.client_reference_id || session.metadata?.guild_id;
        if (!guildId) break;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        await activatePremium(guildId, {
          stripe_customer_id:
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id,
          stripe_subscription_id: subscriptionId ?? null,
          billing_interval: session.metadata?.interval ?? null,
          stripe_checkout_session_id: session.id,
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("stripe webhook handler error:", err);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
