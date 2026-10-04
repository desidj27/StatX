"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Spinner,
} from "@heroui/react";

function PlanSelect({ value, onChange, disabled }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-surface-secondary px-2 py-1.5 text-sm text-foreground"
    >
      <option value="free">Free</option>
      <option value="premium">Premium</option>
    </select>
  );
}

export default function AdminPanel() {
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [draftPlans, setDraftPlans] = useState({});

  async function loadGuilds() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/guilds");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load servers");
      setGuilds(data.guilds ?? []);
      const drafts = {};
      for (const g of data.guilds ?? []) {
        drafts[g.guild_id] = g.plan;
      }
      setDraftPlans(drafts);
    } catch (err) {
      setError(err.message || "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGuilds();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter(
      (g) =>
        g.name?.toLowerCase().includes(q) ||
        g.guild_id.includes(q) ||
        g.plan.includes(q)
    );
  }, [guilds, query]);

  async function savePlan(guildId) {
    setSavingId(guildId);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/guilds/${guildId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: draftPlans[guildId] ?? "free" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setGuilds((rows) =>
        rows.map((g) =>
          g.guild_id === guildId ? { ...g, plan: data.plan, status: data.status } : g
        )
      );
      setMessage(`Updated plan for ${guildId}.`);
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-16 text-muted">
        <Spinner size="md" />
        <span>Loading all servers…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Platform admin</h1>
          <p className="mt-1 text-sm text-muted">
            All servers with data or settings. Manage free vs premium plans.
          </p>
        </div>
        <Button variant="secondary" size="sm" onPress={loadGuilds}>
          ↻ Refresh
        </Button>
      </div>

      <Input
        placeholder="Search by name, guild ID, or plan…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      {message ? (
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{message}</Alert.Description>
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

      <Card className="overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary/60 text-left text-muted">
                <th className="px-4 py-3 font-medium">Server</th>
                <th className="px-4 py-3 font-medium">Guild ID</th>
                <th className="px-4 py-3 font-medium">Bot</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No servers found
                  </td>
                </tr>
              ) : (
                filtered.map((guild) => (
                  <tr key={guild.guild_id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {guild.icon ? (
                          <img
                            src={guild.icon}
                            alt=""
                            className="h-9 w-9 rounded-full bg-surface-tertiary"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-tertiary text-xs font-bold">
                            ?
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{guild.name}</p>
                          <p className="text-xs text-muted">
                            {guild.plan === "premium" ? "Full history" : "90-day visibility"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{guild.guild_id}</td>
                    <td className="px-4 py-3">
                      <Chip
                        size="sm"
                        variant="soft"
                        color={guild.bot_present ? "success" : "default"}
                      >
                        {guild.bot_present ? "In server" : "Not in server"}
                      </Chip>
                    </td>
                    <td className="px-4 py-3">
                      <PlanSelect
                        value={draftPlans[guild.guild_id] ?? guild.plan}
                        disabled={savingId === guild.guild_id}
                        onChange={(plan) =>
                          setDraftPlans((d) => ({ ...d, [guild.guild_id]: plan }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="primary"
                        isDisabled={
                          savingId === guild.guild_id ||
                          (draftPlans[guild.guild_id] ?? guild.plan) === guild.plan
                        }
                        onPress={() => savePlan(guild.guild_id)}
                      >
                        {savingId === guild.guild_id ? "Saving…" : "Save"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted">
        {filtered.length} of {guilds.length} servers shown
      </p>
    </div>
  );
}
