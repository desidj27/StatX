/** Crisp local SVGs for the dashboard — avoids upscaling tiny favicons/CDN bitmaps. */
const LOCAL_ACTIVITY_ICONS = {
  spotify: "/activity-icons/spotify.svg",
  "visual studio code": "/activity-icons/visualstudiocode.svg",
  vscode: "/activity-icons/visualstudiocode.svg",
  medal: "/activity-icons/medal.svg",
};

function normalizeActivityName(activity_name) {
  return activity_name?.toLowerCase().trim() ?? "";
}

export function localActivityIconPath(activity_name) {
  const key = normalizeActivityName(activity_name);
  if (LOCAL_ACTIVITY_ICONS[key]) return LOCAL_ACTIVITY_ICONS[key];
  if (key.includes("spotify")) return LOCAL_ACTIVITY_ICONS.spotify;
  if (key.includes("visual studio") || key.includes("vscode")) {
    return LOCAL_ACTIVITY_ICONS["visual studio code"];
  }
  if (key.includes("medal")) return LOCAL_ACTIVITY_ICONS.medal;
  return null;
}

export function preferLocalActivityIcon(activity_name, image_url) {
  return localActivityIconPath(activity_name) ?? image_url ?? null;
}
