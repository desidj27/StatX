/** Convert YYYY-MM-DD HH:mm in America/New_York to Unix ms. */
export function boostMsInNewYork(y, m, d, hour, minute) {
  const guessUtc = Date.UTC(y, m - 1, d, hour + 5, minute, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  for (let offset = -6; offset <= 2; offset++) {
    const ms = guessUtc + offset * 60 * 60 * 1000;
    const parts = fmt.formatToParts(new Date(ms));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    if (
      get("year") === y &&
      get("month") === m &&
      get("day") === d &&
      get("hour") === hour &&
      get("minute") === minute
    ) {
      return ms;
    }
  }
  throw new Error(`Could not resolve NY time: ${y}-${m}-${d} ${hour}:${minute}`);
}
