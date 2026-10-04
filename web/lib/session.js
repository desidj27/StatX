import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export const sessionOptions = {
  password: process.env.SESSION_SECRET || "change-me-in-production-min-32-chars!!",
  cookieName: "bot_dashboard_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession(cookieStore, sessionOptions);
}
