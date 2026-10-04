import { requireUser } from "./auth.js";

export function getPlatformAdminIds() {
  return (process.env.PLATFORM_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPlatformAdminUser(userId) {
  if (!userId) return false;
  return getPlatformAdminIds().includes(userId);
}

export function platformAdminConfigured() {
  return getPlatformAdminIds().length > 0;
}

export async function requirePlatformAdmin() {
  const auth = await requireUser();
  if (auth.error) return auth;

  if (!platformAdminConfigured()) {
    return { error: "admin_not_configured", status: 503 };
  }

  if (!isPlatformAdminUser(auth.session.user.id)) {
    return { error: "forbidden", status: 403 };
  }

  return { session: auth.session };
}
