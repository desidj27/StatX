import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

const COOKIE_NAME = "statx_dashboard_session_v2";

export const sessionOptions = {
  password: process.env.SESSION_SECRET || "change-me-in-production-min-32-chars!!",
  cookieName: COOKIE_NAME,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

export async function getSession() {
  const cookieStore = await cookies();

  // Drop legacy cookie that can crash SSR after SESSION_SECRET / schema changes
  try {
    if (cookieStore.get("bot_dashboard_session")) {
      cookieStore.delete("bot_dashboard_session");
    }
  } catch {
    // ignore — delete may be unavailable in some render contexts
  }

  try {
    return await getIronSession(cookieStore, sessionOptions);
  } catch (err) {
    console.error("session decrypt failed, resetting cookie:", err?.message || err);
    try {
      cookieStore.delete(COOKIE_NAME);
    } catch {
      // ignore
    }
    // Fresh empty session
    return getIronSession(cookieStore, sessionOptions);
  }
}
