import { redirect } from "next/navigation";
import { exchangeCode, fetchDiscordUser, fetchUserGuilds, isGuildAdmin } from "@/lib/discord.js";
import { isPlatformAdminUser } from "@/lib/platform-admin.js";
import { getSession } from "@/lib/session.js";

export async function GET(request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) redirect("/?error=missing_code");

  let dest = "/dashboard";

  try {
    const token = await exchangeCode(code);
    const user = await fetchDiscordUser(token.access_token);

    const session = await getSession();
    session.user = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar,
    };
    session.accessToken = token.access_token;

    const guilds = await fetchUserGuilds(token.access_token);
    const adminGuilds = guilds
      .filter(isGuildAdmin)
      .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
    session.adminGuilds = adminGuilds;
    session.adminGuildIds = adminGuilds.map((g) => g.id);
    session.isPlatformAdmin = isPlatformAdminUser(user.id);

    dest = session.postLoginRedirect ?? "/dashboard";
    delete session.postLoginRedirect;

    await session.save();
  } catch (err) {
    console.error("OAuth callback error:", err);
    redirect("/?error=oauth_failed");
  }

  redirect(dest);
}
