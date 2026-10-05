import { NextResponse } from "next/server";
import { requireGuildAdmin } from "@/lib/auth.js";
import {
  DEFAULT_GUILD_SETTINGS,
  getGuildSettings,
  mergeGuildSettings,
  updateGuildSettings,
} from "../../../../../../src/guild-settings.js";

export async function GET(_request, { params }) {
  const { guildId } = await params;
  const auth = await requireGuildAdmin(guildId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const settings = await getGuildSettings(guildId);
    return NextResponse.json({ settings, defaults: DEFAULT_GUILD_SETTINGS });
  } catch (err) {
    console.error("settings GET error:", err);
    const msg = String(err?.message || "");
    if (msg.includes("bad auth") || msg.includes("authentication failed")) {
      return NextResponse.json({ error: "mongodb_auth_failed" }, { status: 500 });
    }
    return NextResponse.json({ error: "settings_unavailable" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { guildId } = await params;
  const auth = await requireGuildAdmin(guildId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch = {};
  if (body.features) patch.features = body.features;
  if (body.channels) patch.channels = body.channels;
  if (body.messages) patch.messages = body.messages;
  if (body.timezone) patch.timezone = body.timezone;
  if (body.economy) patch.economy = body.economy;

  const updated = await updateGuildSettings(guildId, patch);
  return NextResponse.json({ settings: mergeGuildSettings(updated) });
}
