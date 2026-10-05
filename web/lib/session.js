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

function emptySession() {
  return {
    user: undefined,
    accessToken: undefined,
    guildIds: undefined,
    save: async () => {},
    destroy: async () => {},
    updateConfig: () => {},
  };
}

export async function getSession() {
  const cookieStore = await cookies();

  try {
    return await getIronSession(cookieStore, sessionOptions);
  } catch (err) {
    console.error("session decrypt failed:", err?.message || err);
    // Cookie clears only work reliably in Route Handlers / Server Actions.
    // Returning an empty session keeps SSR from crashing on corrupt cookies.
    return emptySession();
  }
}
