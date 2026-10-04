const TIME_ZONE = "America/New_York"; // EST/EDT with DST rules

function dayStringFromDateInTz(date, timeZone = TIME_ZONE) {
  // en-CA reliably formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addUtcDays(yyyyMMdd, deltaDays) {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  // string math only; independent of display timezone
  return dayStringFromDateInTz(dt, "UTC");
}

export function todayInTz(timeZone = TIME_ZONE) {
  return dayStringFromDateInTz(new Date(), timeZone);
}

/** Cap filled day count so "all" with no data cannot loop from 1970. */
const MAX_SERIES_FILL_DAYS = 400;

export function resolveRange({ period, from, to, timeZone = TIME_ZONE }) {
  const today = dayStringFromDateInTz(new Date(), timeZone);

  if (from && to) {
    return { start: from, end: to, label: `${from} → ${to}` };
  }

  const p = (period ?? "30d").toLowerCase();

  if (p === "today") {
    return { start: today, end: today, label: "Today" };
  }

  if (p === "all") {
    return { start: "1970-01-01", end: today, label: "All time" };
  }

  const match = p.match(/^(\d+)\s*d$/);
  const days = match ? Number(match[1]) : 30;

  const start = addUtcDays(today, -(days - 1));
  return { start, end: today, label: `Last ${days} days` };
}

export function ensureSeriesDays(series, start, end) {
  const map = new Map(series.map((r) => [r.day, r]));
  const out = [];

  let cursor = start;
  let filled = 0;
  while (cursor <= end) {
    const r = map.get(cursor) ?? { day: cursor, messages: 0, voice_seconds: 0 };
    out.push({
      day: r.day,
      messages: Number(r.messages ?? 0),
      voice_seconds: Number(r.voice_seconds ?? 0),
    });
    cursor = addUtcDays(cursor, 1);
    filled += 1;
    if (filled >= MAX_SERIES_FILL_DAYS) break;
  }

  return out;
}

/** Fewer points for canvas so render does not block the event loop. */
export function downsampleSeriesForChart(series, maxPoints = 120) {
  if (series.length <= maxPoints) return series;
  const step = Math.ceil(series.length / maxPoints);
  const out = [];
  for (let i = 0; i < series.length; i += step) {
    const chunk = series.slice(i, i + step);
    const last = chunk[chunk.length - 1];
    out.push({
      day: last.day,
      messages: chunk.reduce((s, r) => s + Number(r.messages ?? 0), 0),
      voice_seconds: chunk.reduce((s, r) => s + Number(r.voice_seconds ?? 0), 0),
    });
  }
  return out;
}

export function formatHMS(totalSeconds) {
  let s = Math.max(0, Math.floor(totalSeconds));

  const days = Math.floor(s / 86400);
  s %= 86400;

  const h = Math.floor(s / 3600);
  s %= 3600;

  const m = Math.floor(s / 60);
  const sec = s % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  parts.push(`${h}h`, `${m}m`, `${sec}s`);
  return parts.join(" ");
}

export function formatHours(totalSeconds) {
  const hours = totalSeconds / 3600;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${hours.toFixed(0)}h`;
}
