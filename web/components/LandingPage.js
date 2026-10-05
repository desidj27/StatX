"use client";

import { Alert, Button, Card, Chip } from "@heroui/react";
import LoginCard from "@/components/LoginCard.js";

const FEATURES = [
  {
    title: "Message rankings",
    description: "See who talks the most — today, this week, or all time.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
        <path
          d="M4 18V6m0 12h16M8 14V10m4 6V8m4 10V6"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Voice tracking",
    description: "Track time in voice channels with per-member leaderboards.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
        <path
          d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M19 11a7 7 0 0 1-14 0M12 18v3m-4 0h8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Game & activity stats",
    description: "Know what games and apps your community is playing.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
        <path
          d="M6 12h4m-2-2v4m7-1h.01M16 10h.01"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <rect
          x="3"
          y="8"
          width="18"
          height="8"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </svg>
    ),
  },
  {
    title: "Per-server control",
    description: "Toggle features, set channels, and configure everything from the web.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
        <path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.03 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const MONTHLY_PRICE = 5;

function savingsVsMonthly(planPrice, months) {
  const monthlyEquivalent = MONTHLY_PRICE * months;
  return Math.round(((monthlyEquivalent - planPrice) / monthlyEquivalent) * 100);
}

const PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: MONTHLY_PRICE,
    period: "/mo",
    note: "Billed every month",
    highlight: false,
    checkoutUrl: "https://buy.stripe.com/3cIdRa7wu0rc96vcmibV603",
  },
  {
    id: "quarterly",
    name: "Quarterly",
    price: 13,
    period: "/quarter",
    note: `Save ${savingsVsMonthly(13, 3)}% vs monthly`,
    highlight: true,
    badge: "Popular",
    checkoutUrl: "https://buy.stripe.com/14AcN64kigqa3Mb862bV602",
  },
  {
    id: "yearly",
    name: "Yearly",
    price: 50,
    period: "/year",
    note: `Save ${savingsVsMonthly(50, 12)}% vs monthly`,
    highlight: false,
    badge: "Best deal",
    checkoutUrl: "https://buy.stripe.com/8x2aEYcQO8XI6Yn71YbV601",
  },
];

const PREMIUM_PERKS = [
  "Full stats history (no 90-day limit)",
  "All rankings & activity data",
  "Priority for new dashboard features",
];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage({ loginUrl, authError }) {
  return (
    <div className="relative overflow-hidden">
      {/* Background graphics */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="landing-orb landing-orb-a" />
        <div className="landing-orb landing-orb-b" />
        <div className="landing-orb landing-orb-c" />
        <div className="landing-grid" />
      </div>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
        <div className="flex flex-col gap-6">
          <Chip size="sm" variant="soft" color="warning" className="w-fit">
            Discord server analytics
          </Chip>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Know your server{" "}
            <span className="brand-gradient-text">inside and out</span>
          </h1>
          <p className="max-w-lg text-lg text-muted">
            StatX tracks messages, voice time, and game activity — then puts it all
            in a dashboard your admins can actually use.
          </p>
          <div className="flex flex-wrap gap-3">
            {loginUrl ? (
              <Button
                variant="primary"
                size="lg"
                className="font-semibold"
                onPress={() => window.location.assign(loginUrl)}
              >
                Login with Discord
              </Button>
            ) : null}
            <Button variant="secondary" size="lg" onPress={() => scrollTo("pricing")}>
              View pricing
            </Button>
          </div>
        </div>

        {/* Dashboard preview graphic */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="landing-preview-glow" aria-hidden />
          <Card className="relative overflow-hidden border border-border/60 shadow-2xl">
            <div className="brand-gradient h-1 w-full" />
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Server rankings</span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                  Live
                </span>
              </div>
              <div className="space-y-2">
                {[
                  { rank: 1, name: "Alex", stat: "12.4k msgs", pct: 92 },
                  { rank: 2, name: "Jordan", stat: "9.1k msgs", pct: 68 },
                  { rank: 3, name: "Sam", stat: "6.8k msgs", pct: 51 },
                ].map((row) => (
                  <div key={row.rank} className="flex items-center gap-3">
                    <span className="w-4 text-xs text-muted">#{row.rank}</span>
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent/40 to-danger/40" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-muted">{row.stat}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className="brand-gradient h-full rounded-full"
                          style={{ width: `${row.pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {["Messages", "Voice", "Games"].map((tab, i) => (
                  <div
                    key={tab}
                    className={`rounded-lg px-2 py-1.5 text-center text-xs ${
                      i === 0
                        ? "bg-accent/20 font-medium text-accent"
                        : "bg-surface-tertiary text-muted"
                    }`}
                  >
                    {tab}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border/50 bg-surface/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold">Everything you need to run stats</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-muted">
            Built for Discord communities that care about engagement.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className="border border-border/50 bg-surface/80 p-5 transition hover:border-accent/30"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  {f.icon}
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Simple pricing</h2>
            <p className="mx-auto mt-2 max-w-lg text-muted">
              Start free with 90 days of history. Upgrade to Premium for full stats
              access — pick the billing cycle that works for your server.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-4">
            {/* Free tier */}
            <Card className="flex flex-col border border-border/60 p-6">
              <p className="text-sm font-medium text-muted">Free</p>
              <p className="mt-2 text-4xl font-bold">
                $0
                <span className="text-base font-normal text-muted">/forever</span>
              </p>
              <p className="mt-2 text-sm text-muted">Great for trying StatX</p>
              <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-accent">✓</span> Last 90 days of stats
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">✓</span> Dashboard & feature toggles
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">✓</span> Message, voice & game rankings
                </li>
              </ul>
              <Button
                variant="secondary"
                className="mt-6 w-full"
                onPress={() => scrollTo("login")}
              >
                Get started free
              </Button>
            </Card>

            {/* Premium tiers */}
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={`relative flex flex-col p-6 ${
                  plan.highlight
                    ? "border-2 border-accent shadow-lg shadow-accent/10"
                    : "border border-border/60"
                }`}
              >
                {plan.badge ? (
                  <Chip
                    size="sm"
                    color="warning"
                    variant="soft"
                    className="absolute -top-3 right-4"
                  >
                    {plan.badge}
                  </Chip>
                ) : null}
                <p className="text-sm font-medium text-muted">Premium</p>
                <p className="mt-2 text-4xl font-bold">
                  ${plan.price}
                  <span className="text-base font-normal text-muted">{plan.period}</span>
                </p>
                <p className="mt-2 text-sm text-muted">{plan.note}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm">
                  {PREMIUM_PERKS.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <span className="text-accent">✓</span> {perk}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.highlight ? "primary" : "secondary"}
                  className="mt-6 w-full font-semibold"
                  onPress={() =>
                    window.open(plan.checkoutUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  Choose {plan.name.toLowerCase()}
                </Button>
              </Card>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-muted">
            After checkout, Premium is applied to your server. Sign in below to open
            the dashboard anytime.
          </p>
        </div>
      </section>

      {/* Login */}
      <section id="login" className="scroll-mt-20 border-t border-border/50 bg-surface/30 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-bold">Ready to set up your server?</h2>
            <p className="mt-2 text-muted">
              Sign in with Discord to open the dashboard. Only server administrators
              can change settings.
            </p>
          </div>
          <LoginCard loginUrl={loginUrl} authError={authError} />
        </div>
      </section>
    </div>
  );
}
