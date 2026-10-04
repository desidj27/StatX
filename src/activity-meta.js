/** Reliable public logos — Discord app-icon CDN hashes go stale. */
export const KNOWN_APPLICATION_ICONS = {
  "463097721130188830": "https://cdn.simpleicons.org/spotify/1DB954",
  "383226320970055681":
    "https://cdn.jsdelivr.net/npm/simple-icons@11.14.0/icons/visualstudiocode.svg",
};

const KNOWN_ACTIVITY_ICONS = {
  spotify: KNOWN_APPLICATION_ICONS["463097721130188830"],
  "visual studio code": KNOWN_APPLICATION_ICONS["383226320970055681"],
  vscode: KNOWN_APPLICATION_ICONS["383226320970055681"],
  medal: "https://medal.tv/next_assets/icons/standard/medal.svg",
};

const ACTIVITY_NAME_TO_APP_ID = {
  spotify: "463097721130188830",
  "visual studio code": "383226320970055681",
  vscode: "383226320970055681",
};

const ACTIVITY_PLAYING = 0;
const ACTIVITY_LISTENING = 2;

function normalizeActivityName(activity_name) {
  return activity_name?.toLowerCase().trim() ?? "";
}

function isStaleDiscordAppIconUrl(url) {
  return typeof url === "string" && url.includes("cdn.discordapp.com/app-icons/");
}

export function resolveKnownActivityIcon({ activity_name, application_id }) {
  if (application_id && KNOWN_APPLICATION_ICONS[application_id]) {
    return KNOWN_APPLICATION_ICONS[application_id];
  }

  const key = normalizeActivityName(activity_name);
  if (KNOWN_ACTIVITY_ICONS[key]) {
    return KNOWN_ACTIVITY_ICONS[key];
  }

  if (key.includes("spotify")) return KNOWN_ACTIVITY_ICONS.spotify;
  if (key.includes("visual studio") || key.includes("vscode")) {
    return KNOWN_ACTIVITY_ICONS["visual studio code"];
  }
  if (key.includes("medal")) return KNOWN_ACTIVITY_ICONS.medal;

  return null;
}

export function resolveActivityApplicationId(activity_name, applicationId) {
  if (applicationId) return applicationId;
  const key = normalizeActivityName(activity_name);
  if (ACTIVITY_NAME_TO_APP_ID[key]) return ACTIVITY_NAME_TO_APP_ID[key];
  if (key.includes("spotify")) return ACTIVITY_NAME_TO_APP_ID.spotify;
  if (key.includes("visual studio") || key.includes("vscode")) {
    return ACTIVITY_NAME_TO_APP_ID["visual studio code"];
  }
  return null;
}

/** Prefer curated logos; only use stored URLs when they are not stale Discord app icons. */
export function resolveActivityIconUrl({ activity_name, application_id, stored_image_url }) {
  const known = resolveKnownActivityIcon({ activity_name, application_id });
  if (known) return known;

  if (stored_image_url && !isStaleDiscordAppIconUrl(stored_image_url)) {
    return stored_image_url;
  }

  return null;
}

/** App logo for rankings — not album art or in-game screenshots when possible. */
export async function activityMetaFromDiscordActivity(activity) {
  if (!activity?.name || activity.type === 4) return null;

  const activity_name = String(activity.name).trim().slice(0, 100);
  const application_id = resolveActivityApplicationId(activity_name, activity.applicationId);

  let image_url = resolveKnownActivityIcon({ activity_name, application_id });

  if (!image_url) {
    const assetUrl =
      activity.assets?.smallImageURL?.({ size: 64 }) ??
      (activity.type === ACTIVITY_PLAYING
        ? activity.assets?.largeImageURL?.({ size: 64 })
        : null);
    if (assetUrl && !isStaleDiscordAppIconUrl(assetUrl)) {
      image_url = assetUrl;
    }
  }

  if (
    !image_url &&
    activity.type === ACTIVITY_LISTENING &&
    normalizeActivityName(activity_name) === "spotify"
  ) {
    image_url = KNOWN_APPLICATION_ICONS["463097721130188830"];
  }

  return {
    activity_name,
    application_id,
    image_url,
  };
}

export async function trackedActivityFromPresence(presence) {
  for (const activity of presence?.activities ?? []) {
    const meta = await activityMetaFromDiscordActivity(activity);
    if (meta) return meta;
  }
  return null;
}
