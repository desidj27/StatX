"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Description,
  Input,
  Label,
  Spinner,
  Switch,
  Tabs,
  TextArea,
  TextField,
} from "@heroui/react";
import RankingsPanel from "@/components/RankingsPanel.js";

function FeatureSwitch({ label, description, checked, onChange }) {
  return (
    <Switch
      isSelected={checked}
      onChange={(selected) => onChange(!!selected)}
      className="w-full justify-between"
    >
      <Switch.Content className="flex-1 pr-4">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <Description>{description}</Description>}
      </Switch.Content>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch>
  );
}

export default function GuildDashboard({ guildId, guildName }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    setSettings(null);

    fetch(`/api/guilds/${guildId}/settings`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(data.error || `Failed to load settings (${r.status})`);
        }
        if (!data.settings) throw new Error("Failed to load settings");
        if (!cancelled) setSettings(data.settings);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load settings");
      });

    return () => {
      cancelled = true;
    };
  }, [guildId]);

  async function saveSettings() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/guilds/${guildId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSettings(data.settings);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function updateFeature(key, value) {
    if (!settings) return;
    const nextFeatures = { ...settings.features, [key]: value };
    setSettings((s) => ({ ...s, features: nextFeatures }));
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: nextFeatures }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSettings(data.settings);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateChannel(key, value) {
    setSettings((s) => ({
      ...s,
      channels: { ...s.channels, [key]: value || null },
    }));
  }

  function updateMessage(key, value) {
    setSettings((s) => ({
      ...s,
      messages: { ...s.messages, [key]: value },
    }));
  }

  function updateEconomy(key, value) {
    setSettings((s) => ({
      ...s,
      economy: { ...s.economy, [key]: Number(value) || 0 },
    }));
  }

  if (!settings) {
    if (error) {
      return (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not load settings</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      );
    }
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-default-500">
        <Spinner size="md" />
        <span>Loading server settings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Tabs defaultSelectedKey="settings" className="w-full">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Guild sections">
            <Tabs.Tab id="settings">
              Settings
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="rankings">
              Rankings
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="settings" className="flex flex-col gap-6 pt-6">
          <Card className="border border-border/60 p-4">
            <Card.Header>
              <Card.Title>Features</Card.Title>
              <Card.Description>
                Feature toggles save immediately. Channels and messages use Save
                settings below.
              </Card.Description>
            </Card.Header>
            <Card.Content className="flex flex-col gap-4 divide-y divide-default-100">
              <FeatureSwitch
                label="Economy"
                description="Balance, daily, coinflip, dice, high/low"
                checked={settings.features.economy}
                onChange={(v) => updateFeature("economy", v)}
              />
              <FeatureSwitch
                label="Moderation"
                description="/ban and auto-ban trap channel"
                checked={settings.features.moderation}
                onChange={(v) => updateFeature("moderation", v)}
              />
              <FeatureSwitch
                label="Quotes"
                description="Message context menu → quote image"
                checked={settings.features.quotes}
                onChange={(v) => updateFeature("quotes", v)}
              />
              <FeatureSwitch
                label="Recaps"
                description="Weekly and yearly recap embeds"
                checked={settings.features.recaps}
                onChange={(v) => updateFeature("recaps", v)}
              />
              <FeatureSwitch
                label="Boost shame"
                description="Message when someone stops boosting"
                checked={settings.features.boost_shame}
                onChange={(v) => updateFeature("boost_shame", v)}
              />
            </Card.Content>
          </Card>

          <Card className="border border-border/60 p-4">
            <Card.Header>
              <Card.Title>Channels</Card.Title>
              <Card.Description>
                Paste Discord channel IDs (Developer Mode → right-click channel → Copy
                ID).
              </Card.Description>
            </Card.Header>
            <Card.Content className="grid gap-4 sm:grid-cols-2">
              {[
                ["ban_log", "Ban log channel"],
                ["auto_ban_trap", "Auto-ban trap channel"],
                ["quote", "Quote channel"],
                ["recap", "Recap channel"],
                ["boost_shame", "Boost shame channel"],
              ].map(([key, label]) => (
                <TextField
                  key={key}
                  fullWidth
                  value={settings.channels[key] ?? ""}
                  onChange={(v) => updateChannel(key, v.trim())}
                >
                  <Label>{label}</Label>
                  <Input placeholder="Channel ID" />
                </TextField>
              ))}
            </Card.Content>
          </Card>

          <Card className="border border-border/60 p-4">
            <Card.Header>
              <Card.Title>Messages & economy</Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-col gap-4">
              <TextField
                fullWidth
                value={settings.timezone}
                onChange={(v) => setSettings((s) => ({ ...s, timezone: v }))}
              >
                <Label>Timezone (IANA)</Label>
                <Input placeholder="America/New_York" />
                <Description>Used for daily stats boundaries and /daily reset</Description>
              </TextField>

              <TextField
                fullWidth
                value={settings.messages.auto_ban_reason}
                onChange={(v) => updateMessage("auto_ban_reason", v)}
              >
                <Label>Auto-ban reason</Label>
                <Input />
              </TextField>

              <TextField
                fullWidth
                value={settings.messages.ban_log_template}
                onChange={(v) => updateMessage("ban_log_template", v)}
              >
                <Label>Ban log template</Label>
                <TextArea rows={4} />
                <Description>
                  Variables: {"{tag}"}, {"{user_id}"}, {"{reason}"}, {"{banned_by}"}
                </Description>
              </TextField>

              <TextField
                fullWidth
                value={String(settings.economy.daily_reward_base)}
                onChange={(v) => updateEconomy("daily_reward_base", v)}
              >
                <Label>Daily reward base</Label>
                <Input type="number" />
              </TextField>
            </Card.Content>
          </Card>

          <Button
            variant="primary"
            onPress={saveSettings}
            isDisabled={saving}
            className="w-fit"
          >
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </Tabs.Panel>

        <Tabs.Panel id="rankings" className="pt-6">
          <RankingsPanel guildId={guildId} guildName={guildName} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
