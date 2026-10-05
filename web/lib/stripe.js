import Stripe from "stripe";
import { appBaseUrl } from "./discord.js";

/** Existing Payment Links — used to resolve Stripe Price IDs for Checkout Sessions. */
export const STRIPE_PAYMENT_LINKS = {
  monthly: "3cIdRa7wu0rc96vcmibV603",
  quarterly: "14AcN64kigqa3Mb862bV602",
  yearly: "8x2aEYcQO8XI6Yn71YbV601",
};

const priceCache = new Map();

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

async function resolvePriceId(stripe, interval) {
  const envKey = {
    monthly: "STRIPE_PRICE_MONTHLY",
    quarterly: "STRIPE_PRICE_QUARTERLY",
    yearly: "STRIPE_PRICE_YEARLY",
  }[interval];
  const fromEnv = envKey ? process.env[envKey]?.trim() : "";
  if (fromEnv) return fromEnv;

  if (priceCache.has(interval)) return priceCache.get(interval);

  const linkId = STRIPE_PAYMENT_LINKS[interval];
  if (!linkId) throw new Error(`Unknown billing interval: ${interval}`);

  const items = await stripe.paymentLinks.listLineItems(linkId, { limit: 1 });
  const priceId = items.data[0]?.price?.id;
  if (!priceId) throw new Error(`No price found for payment link ${linkId}`);

  priceCache.set(interval, priceId);
  return priceId;
}

export async function createGuildCheckoutSession({ guildId, guildName, interval, userId }) {
  const stripe = getStripe();
  if (!stripe) throw new Error("stripe_not_configured");

  const priceId = await resolvePriceId(stripe, interval);
  const base = appBaseUrl();

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dashboard/${guildId}?billing=success`,
    cancel_url: `${base}/dashboard/${guildId}?billing=canceled`,
    client_reference_id: guildId,
    metadata: {
      guild_id: guildId,
      guild_name: guildName?.slice(0, 100) ?? "",
      interval,
      discord_user_id: userId ?? "",
    },
    subscription_data: {
      metadata: {
        guild_id: guildId,
        interval,
        discord_user_id: userId ?? "",
      },
    },
  });
}

export function subscriptionIsPremium(status) {
  return status === "active" || status === "trialing" || status === "past_due";
}
