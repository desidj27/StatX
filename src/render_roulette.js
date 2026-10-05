// roulette-gif-v3 — vendored encoder (NO npm gifenc package)
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_CANDIDATES = [
  path.join(__dirname, "vendor", "gifenc.esm.js"), // src/vendor/...
  path.join(__dirname, "..", "vendor", "gifenc.esm.js"), // /vendor/... (Bisect mis-upload)
];

const VENDOR_GIFENC = VENDOR_CANDIDATES.find((p) => fs.existsSync(p));
if (!VENDOR_GIFENC) {
  throw new Error(
    `[roulette] Missing gifenc.esm.js. Expected one of:\n${VENDOR_CANDIDATES.join("\n")}`
  );
}
console.log(`[roulette] using encoder ${VENDOR_GIFENC}`);

const { GIFEncoder, quantize, applyPalette } = await import(
  pathToFileURL(VENDOR_GIFENC).href
);

/** European single-zero wheel order (clockwise). */
export const EUROPEAN_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function pocketFill(n) {
  if (n === 0) return "#0f9d58";
  return RED.has(n) ? "#c0392b" : "#1a1a1a";
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function drawWheel(ctx, cx, cy, radius, rotation) {
  const slice = (Math.PI * 2) / EUROPEAN_WHEEL.length;
  const outer = radius;
  const inner = radius * 0.55;
  const textR = (outer + inner) / 2;

  for (let i = 0; i < EUROPEAN_WHEEL.length; i++) {
    const n = EUROPEAN_WHEEL[i];
    const a0 = rotation + i * slice - Math.PI / 2;
    const a1 = a0 + slice;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outer, a0, a1);
    ctx.closePath();
    ctx.fillStyle = pocketFill(n);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, a0, a1);
    ctx.stroke();

    const mid = a0 + slice / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * textR, cy + Math.sin(mid) * textR);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = "#2b2d31";
  ctx.fill();
  ctx.strokeStyle = "#faa61a";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, inner * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = "#1e2124";
  ctx.fill();

  ctx.fillStyle = "#faa61a";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("StatX", cx, cy);
}

function drawPointer(ctx, cx, cy, radius) {
  const tipY = cy - radius + 2;
  ctx.beginPath();
  ctx.moveTo(cx, tipY + 22);
  ctx.lineTo(cx - 12, tipY - 2);
  ctx.lineTo(cx + 12, tipY - 2);
  ctx.closePath();
  ctx.fillStyle = "#faa61a";
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawBall(ctx, cx, cy, radius, rotation, pocketIndex, progress) {
  const slice = (Math.PI * 2) / EUROPEAN_WHEEL.length;
  const settleAngle = rotation + pocketIndex * slice + slice / 2 - Math.PI / 2;
  const spinExtra = (1 - progress) * Math.PI * 4;
  const angle = settleAngle - spinExtra;
  const ballR = radius * 0.9;
  const x = cx + Math.cos(angle) * ballR;
  const y = cy + Math.sin(angle) * ballR;

  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#f5f5f5";
  ctx.fill();
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFrame(size, rotation, pocketIndex, progress, revealLabel) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2);
  ctx.fillStyle = "#0b3d2e";
  ctx.fill();

  drawWheel(ctx, cx, cy, radius, rotation);
  drawBall(ctx, cx, cy, radius, rotation, pocketIndex, progress);
  drawPointer(ctx, cx, cy, radius);

  if (revealLabel) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(size * 0.18, size * 0.78, size * 0.64, 42);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(revealLabel, cx, size * 0.78 + 21);
  }

  return { canvas, imageData: ctx.getImageData(0, 0, size, size) };
}

/** Still PNG of the wheel stopped on `pocket` (fallback). */
export function renderRouletteStillPng(pocket, { size = 360 } = {}) {
  const pocketIndex = EUROPEAN_WHEEL.indexOf(pocket);
  if (pocketIndex < 0) throw new Error(`invalid pocket: ${pocket}`);
  const slice = (Math.PI * 2) / EUROPEAN_WHEEL.length;
  const rotation = -(pocketIndex + 0.5) * slice;
  const label = `${pocket} · ${pocket === 0 ? "green" : RED.has(pocket) ? "red" : "black"}`;
  const { canvas } = drawFrame(size, rotation, pocketIndex, 1, label);
  return canvas.toBuffer("image/png");
}

/**
 * Build an animated roulette GIF that eases out onto `pocket` (0–36).
 * @returns {Buffer}
 */
export function renderRouletteSpinGif(pocket, { size = 360, frames = 32 } = {}) {
  const pocketIndex = EUROPEAN_WHEEL.indexOf(pocket);
  if (pocketIndex < 0) throw new Error(`invalid pocket: ${pocket}`);

  const slice = (Math.PI * 2) / EUROPEAN_WHEEL.length;
  const finalRotation = -(pocketIndex + 0.5) * slice;
  const spins = 4;
  const startRotation = finalRotation - spins * Math.PI * 2;

  const holdFrames = 8;
  const totalFrames = frames + holdFrames;

  const first = drawFrame(size, startRotation, pocketIndex, 0, null).imageData;
  const palette = quantize(first.data, 64);

  const gif = GIFEncoder();
  for (let i = 0; i < totalFrames; i++) {
    const spinI = Math.min(i, frames - 1);
    const t = spinI / (frames - 1);
    const eased = easeOutCubic(t);
    const rotation = startRotation + (finalRotation - startRotation) * eased;
    const progress = eased;
    const reveal =
      i >= frames
        ? `${pocket} · ${pocket === 0 ? "green" : RED.has(pocket) ? "red" : "black"}`
        : null;

    const image = drawFrame(size, rotation, pocketIndex, progress, reveal).imageData;
    const index = applyPalette(image.data, palette);
    gif.writeFrame(index, size, size, {
      palette,
      delay: i >= frames ? 12 : 4,
    });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}
