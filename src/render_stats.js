import { createCanvas, loadImage } from "@napi-rs/canvas";
import { formatHours } from "./periods.js";

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawGrid(ctx, x, y, w, h, rows = 4) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;

  for (let i = 0; i <= rows; i++) {
    const yy = y + (h * i) / rows;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  ctx.restore();
}

function scaleMax(values, minMax = 10) {
  const max = Math.max(...values, 0);
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
  const nice = Math.ceil(max / pow) * pow;
  return Math.max(nice, minMax);
}

function formatVoiceTick(hours) {
  if (hours === 0) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${hours.toFixed(0)}h`;
}

async function drawAvatarCircle(ctx, { url, x, y, size }) {
  if (!url) return;
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    // ignore avatar failures; card still renders
  }
}

export async function renderStatsCard({
  avatarUrl,
  title,
  subtitle,
  rangeLabel,
  totals,
  series,
}) {
  const legendPadding = 16;
  const W = 1200;
  const H = 500;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, W, H);

  const pad = 24;
  const cardX = pad;
  const cardY = pad;
  const cardW = W - pad * 2;
  const cardH = H - pad * 2;

  ctx.fillStyle = "#141823";
  roundRect(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.fill();

  const avatarSize = avatarUrl ? 56 : 0;
  const headerLeftX = cardX + 22;
  const titleX = headerLeftX + (avatarSize ? avatarSize + 16 : 0);

  if (avatarUrl) {
    await drawAvatarCircle(ctx, {
      url: avatarUrl,
      x: headerLeftX,
      y: cardY + 18,
      size: avatarSize,
    });

    // subtle ring
    ctx.save();
    ctx.strokeStyle = "#2a3142";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      headerLeftX + avatarSize / 2,
      cardY + 18 + avatarSize / 2,
      avatarSize / 2 + 1,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = "#e8eaf0";
  ctx.font = "700 28px sans-serif";
  ctx.fillText(title, titleX, cardY + 46);

  ctx.fillStyle = "#a8afbf";
  ctx.font = "500 16px sans-serif";
  ctx.fillText(subtitle, titleX, cardY + 72);

  ctx.fillStyle = "#8b93a8";
  ctx.font = "500 14px sans-serif";
  ctx.fillText(rangeLabel, titleX, cardY + 96);

  const pillY = cardY + 24;
  const pillH = 36;

  function pill(x, label, value) {
    const w = 240;
    ctx.fillStyle = "#0f1115";
    roundRect(ctx, x, pillY, w, pillH, 14);
    ctx.fill();

    ctx.fillStyle = "#a8afbf";
    ctx.font = "600 13px sans-serif";
    ctx.fillText(label, x + 14, pillY + 23);

    ctx.fillStyle = "#e8eaf0";
    ctx.font = "800 16px sans-serif";
    const text = String(value);
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, x + w - 14 - tw, pillY + 24);
    return x + w + 12;
  }

  let px = cardX + cardW - (240 * 2 + 12) - 22;
  px = pill(px, "Messages", totals.messages);
  pill(px, "Voice", formatHours(totals.voice_seconds));

  const chartX = cardX + 22;
  const chartY = cardY + 120;
  const chartW = cardW - 44;
  const chartH = cardH - 150;

  ctx.fillStyle = "#101420";
  roundRect(ctx, chartX, chartY, chartW, chartH, 14);
  ctx.fill();

  const axisPad = 58;
  const innerX = chartX + 16 + axisPad;
  const innerY = chartY + 16;
  const innerW = chartW - 32 - axisPad * 2;
  const innerH = chartH - 48 - legendPadding;

  const msgVals = series.map((r) => r.messages);
  const voiceHoursVals = series.map((r) => r.voice_seconds / 3600);

  const maxMsg = scaleMax(msgVals, 5);
  const maxVoice = scaleMax(voiceHoursVals, 1);

  ctx.strokeStyle = "#2a3142";
  drawGrid(ctx, innerX, innerY, innerW, innerH, 4);

  // Y axes labels (aligned to grid)
  ctx.save();
  ctx.fillStyle = "#7f889e";
  ctx.font = "600 12px sans-serif";
  ctx.textBaseline = "middle";
  const rows = 4;
  for (let i = 0; i <= rows; i++) {
    const t = 1 - i / rows;
    const yy = innerY + (innerH * i) / rows;

    const msgTick = Math.round(maxMsg * t);
    const msgLabel = String(msgTick);
    const msgW = ctx.measureText(msgLabel).width;
    ctx.fillText(msgLabel, innerX - 10 - msgW, yy);

    const voiceTick = maxVoice * t;
    const vLabel = formatVoiceTick(voiceTick);
    ctx.fillText(vLabel, innerX + innerW + 10, yy);
  }
  ctx.restore();

  const n = series.length;
  const gap = Math.max(2, Math.floor((innerW / Math.max(n, 1)) * 0.15));
  const barW = Math.max(4, Math.floor((innerW - gap * (n - 1)) / n));

  // Bars
  ctx.save();
  ctx.fillStyle = "#2a3142";
  for (let i = 0; i < n; i++) {
    const v = series[i].messages;
    const h = (v / maxMsg) * innerH;
    const x = innerX + i * (barW + gap);
    const y = innerY + (innerH - h);
    roundRect(ctx, x, y, barW, h, 4);
    ctx.fill();
  }
  ctx.restore();

  // Line
  ctx.save();
  ctx.strokeStyle = "#37d67a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const v = voiceHoursVals[i];
    const y = innerY + innerH - (v / maxVoice) * innerH;
    const x = innerX + i * (barW + gap) + barW / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "#37d67a";
  for (let i = 0; i < n; i++) {
    const v = voiceHoursVals[i];
    const y = innerY + innerH - (v / maxVoice) * innerH;
    const x = innerX + i * (barW + gap) + barW / 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // X labels (sparse)
  ctx.fillStyle = "#7f889e";
  ctx.font = "500 12px sans-serif";
  const labelCount = Math.min(6, n);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((i * (n - 1)) / Math.max(labelCount - 1, 1));
    const day = series[idx].day;
    const label = day.slice(5);
    const x = innerX + idx * (barW + gap) + barW / 2;
    const y = innerY + innerH + 22;
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, x - tw / 2, y);
  }

  // Legend
  ctx.fillStyle = "#a8afbf";
  ctx.font = "600 13px sans-serif";
  ctx.fillText("Messages (bars) • Voice hours (line)", chartX + 18, chartY + chartH - 12);

  return canvas.toBuffer("image/png");
}
