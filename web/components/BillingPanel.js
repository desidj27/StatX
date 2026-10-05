"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Chip, Spinner } from "@heroui/react";

const PLANS = [
  { id: "monthly", label: "Monthly", price: "$5/mo" },
  { id: "quarterly", label: "Quarterly", price: "$13/quarter", popular: true },
  { id: "yearly", label: "Yearly", price: "$50/year" },
];

export default function BillingPanel({ guildId }) {
  const [planInfo, setPlanInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPlan() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/guilds/${guildId}/plan`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load plan");
      setPlanInfo(data);
    } catch (err) {
      setError(err.message || "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlan();
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      setNotice("Payment received — Premium will activate in a few seconds.");
      setTimeout(loadPlan, 2500);
    } else if (params.get("billing") === "canceled") {
      setNotice("Checkout canceled. No charge was made.");
    }
  }, [guildId]);

  async function startCheckout(interval) {
    setCheckoutLoading(interval);
    setError("");
    try {
      const res = await fetch(`/api/guilds/${guildId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "stripe_not_configured"
            ? "Billing is not configured yet."
            : data.error || "Checkout failed"
        );
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message || "Checkout failed");
      setCheckoutLoading(null);
    }
  }

  if (loading && !planInfo) {
    return (
      <div className="flex items-center gap-3 py-8 text-muted">
        <Spinner size="sm" />
        <span>Loading plan…</span>
      </div>
    );
  }

  const isPremium = planInfo?.plan === "premium";

  return (
    <Card className="border border-border/60 p-4">
      <Card.Header>
        <div className="flex flex-wrap items-center gap-3">
          <Card.Title>Plan & billing</Card.Title>
          <Chip size="sm" variant="soft" color={isPremium ? "warning" : "default"}>
            {isPremium ? "Premium" : "Free"}
          </Chip>
        </div>
        <Card.Description>
          {isPremium
            ? "Full stats history is unlocked for this server."
            : "Free shows the last 90 days. Upgrade for full history."}
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4 pt-2">
        {notice ? (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{notice}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {!isPremium && planInfo?.stripe_configured ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border p-4 ${
                  p.popular ? "border-accent bg-accent/5" : "border-border/60"
                }`}
              >
                <p className="text-sm font-medium">{p.label}</p>
                <p className="mt-1 text-xl font-bold">{p.price}</p>
                <Button
                  className="mt-4 w-full"
                  variant={p.popular ? "primary" : "secondary"}
                  isDisabled={!!checkoutLoading}
                  onPress={() => startCheckout(p.id)}
                >
                  {checkoutLoading === p.id ? "Redirecting…" : `Choose ${p.label.toLowerCase()}`}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {!isPremium && planInfo && !planInfo.stripe_configured ? (
          <p className="text-sm text-muted">
            Stripe is not configured on this deployment yet. Ask your operator to add
            billing keys.
          </p>
        ) : null}

        {isPremium ? (
          <p className="text-sm text-muted">
            Manage or cancel your subscription from the receipt email Stripe sent you, or
            contact support.
          </p>
        ) : null}
      </Card.Content>
    </Card>
  );
}
