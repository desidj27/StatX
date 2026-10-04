import { NextResponse } from "next/server";
import { getSessionGuilds, requireUser } from "@/lib/auth.js";

export async function POST() {
  const auth = await requireUser();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const guilds = await getSessionGuilds(auth.session, { persist: true });
    return NextResponse.json({ guilds });
  } catch (err) {
    console.error("sync-guilds error:", err);
    return NextResponse.json({ error: "relogin_required" }, { status: 401 });
  }
}
