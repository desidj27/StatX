import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "assets", "fonts");
/** Registered family used for quote images (Discord-like sans). */
export const QUOTE_FONT = "StatXSans";

const FONT_FILES = [
  { file: "Inter-Regular.ttf", url: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-400-normal.ttf" },
  { file: "Inter-Medium.ttf", url: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-500-normal.ttf" },
  { file: "Inter-SemiBold.ttf", url: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-600-normal.ttf" },
];

let fontsReady = false;

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function loadFontFile(entry) {
  const dest = path.join(FONTS_DIR, entry.file);
  try {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      return fs.readFileSync(dest);
    }
  } catch {
    // continue to download
  }

  fs.mkdirSync(FONTS_DIR, { recursive: true });
  const buf = await fetchBuffer(entry.url);
  fs.writeFileSync(dest, buf);
  return buf;
}

async function ensureQuoteFonts() {
  if (fontsReady) return;

  let registered = 0;
  for (const entry of FONT_FILES) {
    try {
      const buf = await loadFontFile(entry);
      if (GlobalFonts.register(buf, QUOTE_FONT)) registered += 1;
    } catch (err) {
      console.error(`[quote] font load failed (${entry.file}):`, err?.message || err);
    }
  }

  const hasFamily = GlobalFonts.has(QUOTE_FONT);
  console.log(
    `[quote] fonts registered=${registered} has=${hasFamily} families=${GlobalFonts.families.length}`
  );
  fontsReady = hasFamily || registered > 0;
}

function quoteFontStack(weight, sizePx) {
  // Prefer bundled Inter; never rely on Discord's proprietary "gg sans".
  return `${weight} ${sizePx}px "${QUOTE_FONT}", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif`;
}

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(
            new Error(`Failed to get image. Status code: ${res.statusCode}`)
          );
        }
        const data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
      })
      .on("error", reject);
  });
}

function parseMessageTokens(text, channels, users) {
  const tokens = [];
  const regex = /(<#(\d+)>|<@(\d+)>|[^<]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      const id = match[2];
      const name = channels?.[id]?.name || "deleted-channel";
      tokens.push({ type: "channel", text: `#${name}` });
    } else if (match[3]) {
      const id = match[3];
      const name = users?.[id]?.username || "unknown-user";
      tokens.push({ type: "user", text: `@${name}` });
    } else {
      tokens.push({ type: "text", text: match[0] });
    }
  }
  return tokens;
}

function measureTokenLines(ctx, tokens, maxWidth) {
  let cursorX = 0;
  let lines = 1;

  for (const token of tokens) {
    const parts = token.text.split(/(\s+)/);
    for (const part of parts) {
      const w = ctx.measureText(part).width;
      if (cursorX + w > maxWidth && cursorX > 0) {
        lines++;
        cursorX = 0;
      }
      cursorX += w;
    }
  }

  return lines;
}

function drawTokens(ctx, tokens, x, y, maxWidth, lineHeight) {
  let cursorX = x;
  let cursorY = y;

  for (const token of tokens) {
    const parts = token.text.split(/(\s+)/);

    for (const part of parts) {
      const w = ctx.measureText(part).width;

      if (cursorX + w > x + maxWidth && cursorX > x) {
        cursorY += lineHeight;
        cursorX = x;
      }

      if (token.type === "channel" || token.type === "user") {
        const pillPadX = 4;
        const pillPadY = 4;

        ctx.fillStyle = "#5865f2";
        ctx.fillRect(
          cursorX - pillPadX / 2,
          cursorY - lineHeight + pillPadY,
          w + pillPadX,
          lineHeight
        );

        ctx.fillStyle = "#ffffff";
        ctx.fillText(part, cursorX, cursorY);

        cursorX += w;
      } else {
        ctx.fillStyle = "#dcddde";
        ctx.fillText(part, cursorX, cursorY);
        cursorX += w;
      }
    }
  }
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

/**
 * Discord-style quote image. Fonts are bundled (and auto-downloaded if missing)
 * so Linux hosts never fall back to a serif face.
 */
export async function renderQuoteImage({ message }) {
  await ensureQuoteFonts();

  const content = message?.content ?? "";
  const author = message?.author;
  const member = message?.member;

  const username = member?.displayName || author?.username || "Unknown";
  const timestamp = message?.createdTimestamp ?? Date.now();

  const channels = {};
  if (message?.guild?.channels?.cache) {
    for (const [id, ch] of message.guild.channels.cache) {
      channels[id] = { name: ch?.name };
    }
  }

  const users = {};
  if (message?.mentions?.users) {
    for (const [id, u] of message.mentions.users) {
      users[id] = { username: u?.username };
    }
  }
  if (author?.id) users[author.id] = { username: author.username };

  const avatarURL =
    author?.displayAvatarURL?.({ extension: "png", size: 128 }) ||
    author?.avatarURL?.() ||
    null;

  const W = 800;
  const paddingY = 20;
  const avatarSize = 56;
  const avatarX = 20;
  const avatarY = paddingY;

  const baseFontSize = 16;
  const usernameFont = quoteFontStack(600, baseFontSize + 4);
  const timeFont = quoteFontStack(500, baseFontSize);
  const messageFont = quoteFontStack(400, baseFontSize + 2);
  const lineHeight = baseFontSize + 6;

  const nameX = avatarX + avatarSize + 14;
  const nameY = avatarY + 20;

  const tmp = createCanvas(W, 10);
  const tctx = tmp.getContext("2d");
  tctx.font = messageFont;

  const tokens = parseMessageTokens(content, channels, users);
  const maxTextWidth = 680;
  const lines = Math.max(1, measureTokenLines(tctx, tokens, maxTextWidth));

  const headerH = 56;
  const bodyH = lines * lineHeight;
  const H = paddingY * 2 + headerH + bodyH;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2b2d31";
  ctx.fillRect(0, 0, W, H);

  if (avatarURL) {
    try {
      const buf = await fetchImageBuffer(avatarURL);
      const avatar = await loadImage(buf);

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch {
      ctx.fillStyle = "#1f2125";
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  let nameColor = "#ffffff";
  const displayColor = member?.displayColor;
  if (typeof displayColor === "number" && displayColor !== 0) {
    nameColor = `#${displayColor.toString(16).padStart(6, "0")}`;
  }

  const nameTimeGap = 6;
  const headerRightPad = 20;
  const headerMaxX = W - headerRightPad;

  ctx.font = timeFont;
  ctx.fillStyle = "#b0b0b0";
  const timeText = " " + formatTimestamp(timestamp);
  const timeWidth = ctx.measureText(timeText).width;

  const maxNameWidth = headerMaxX - nameX - nameTimeGap - timeWidth;

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    nameX,
    nameY - (baseFontSize + 6),
    Math.max(0, maxNameWidth),
    baseFontSize + 12
  );
  ctx.clip();

  ctx.font = usernameFont;
  const nameWidth = ctx.measureText(username).width;

  ctx.fillStyle = nameColor;
  ctx.fillText(username, nameX, nameY);
  ctx.restore();

  ctx.font = timeFont;
  ctx.fillStyle = "#b0b0b0";
  const effectiveNameWidth = Math.min(nameWidth, maxNameWidth);
  const timeX = nameX + effectiveNameWidth + nameTimeGap;

  ctx.fillText(timeText, timeX, nameY);

  ctx.font = messageFont;
  drawTokens(ctx, tokens, nameX, nameY + 26, maxTextWidth, lineHeight);

  return canvas.toBuffer("image/png");
}
