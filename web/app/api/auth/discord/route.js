import { redirect } from "next/navigation";
import { discordOAuthUrl } from "@/lib/discord.js";
import { getSession } from "@/lib/session.js";

export async function GET(request) {
  const next = new URL(request.url).searchParams.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    const session = await getSession();
    session.postLoginRedirect = next;
    await session.save();
  }
  redirect(discordOAuthUrl());
}
