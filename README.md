# Discord Stats Bot

Multi-server Discord bot with stats, optional economy, moderation, and quotes. Each server is configured via a web dashboard (Discord OAuth, administrators only). Data is isolated per guild.

**Plans:** Free (last 90 days visible in dashboard and commands). Premium (full history) — per-guild subscription; billing integration coming soon. Older data is always stored.

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Install dependencies:

```bash
npm install
cd web && npm install
```

3. **MongoDB** — set `MONGODB_URI` (and optional `MONGODB_DB`, default `degeneratebot`).

4. **MongoDB Atlas** (`cluster0.4lv4iop.mongodb.net`) — in `.env`:

```env
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.4lv4iop.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=degeneratebot
```

Get the user/password from Atlas → Database → Connect → Drivers. URL-encode special characters in the password (`@` → `%40`, etc.).

5. **Migrate existing SQLite data** (one-time, after `MONGODB_URI` is set):

```bash
npm run migrate:mongo
```

Re-import and replace data already in Atlas: `npm run migrate:mongo:force`

If charts show old totals but **flat lines after a date**, the first migration likely skipped collections that already had partial data. Copy `stats.sqlite` from the game panel into the project root, then merge without wiping Mongo:

```bash
npm run merge:mongo
npm run verify:mongo
```

`merge:mongo` upserts each day and keeps the **higher** message/voice counts from SQLite vs Mongo.

If stats look wrong (game names in data, inflated totals), remove bad rows and re-check:

```bash
npm run audit:mongo
node scripts/audit-user-daily-days.js --delete
npm run verify:mongo
```

**Start fresh (delete everything):**

```bash
npm run wipe:data
```

This clears all MongoDB collections and removes local `stats.sqlite` files. Stop the bot on the game panel first; delete `stats.sqlite` there too if the panel still has an old copy.

6. Start the bot (writes **only** to MongoDB — not `stats.sqlite`):

```bash
npm start
```

You should see: `MongoDB: cluster0.4lv4iop.mongodb.net / db: degeneratebot (all bot data writes here)`

**Game panel / VPS:** add the same `MONGODB_URI` and `MONGODB_DB` to the host’s environment variables, then restart the bot. Without this, new messages, voice, economy, etc. will not reach Atlas.

### Boost events not logging

1. **Discord Developer Portal → Bot → Privileged Gateway Intents:** turn on **Server Members Intent** (required for `guildMemberUpdate` and resolving “**Name** just boosted the server” messages).
2. **Upload** `src/index.js` and `src/boost-log.js` (latest boost detection).
3. **Bot role:** **View Channel** on the server’s boost/system channel; **View Audit Log** helps as a fallback.
4. On startup you should see: `Boost logging: guildMemberUpdate + boost system messages...`
5. When someone boosts, panel logs should show `[boost] logged user=...` or `[boost] guildMemberUpdate ...`. If you see `could not resolve booster`, paste that log line.
6. Manual backfill: `npm run log:boost -- GUILD_ID USER_ID` (see `boosts-backfill.json`).

### MongoDB SSL error on game panel (`tlsv1 alert internal error`)

1. **Atlas → Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`). Game panel IPs change; this is the usual fix.
2. **Panel env vars:** set `MONGODB_URI` and `MONGODB_DB` in the panel UI (not only in a local `.env` file).
3. **Password:** if it contains `@ # % &` etc., [URL-encode](https://www.urlencoder.org/) it in the connection string.
4. **Upload latest files:** `src/db.js` and `src/db/mongo.js` (shim that re-exports `db.js`).
5. If it still fails on **Node 24**, switch the panel to **Node 20 LTS** (OpenSSL/TLS quirks on some hosts).

7. **Discord Developer Portal** (same application as the bot):

- OAuth2 → add redirect: `http://localhost:3000/api/auth/callback` (and your Vercel URL in production).
- Copy **Client ID** and **Client Secret** into `web/.env.local` (see `.env.example`).

8. Start the dashboard (Next.js):

```bash
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Discord. Only servers where you have **Administrator** and the bot is installed appear.

## Dashboard

- Per-guild **feature toggles**: economy, moderation, quotes, recaps, boost shame
- **Channel IDs** and custom messages (ban log, auto-ban, quotes, etc.)
- **Stats** overview (respects free 90-day limit)
- **Timezone** and economy tuning per server

Configure everything at `/dashboard` after login. No hardcoded channel IDs — set them in the dashboard for each server.

### Platform admin (`/admin`)

Operators can manage **all servers** and toggle **free vs premium** plans:

1. Set `PLATFORM_ADMIN_USER_IDS` in `web/.env.local` to your Discord user ID (comma-separated for multiple admins).
2. Open [http://localhost:3000/admin](http://localhost:3000/admin) and sign in with Discord.
3. Search servers, change plan, and save. Premium unlocks full stats history for that guild.

Only user IDs in `PLATFORM_ADMIN_USER_IDS` can access `/admin` and the admin API routes.

## Environment

| Variable | Used by |
|----------|---------|
| `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` | Bot |
| `MONGODB_URI`, `MONGODB_DB` | Bot + dashboard |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Dashboard OAuth |
| `DISCORD_TOKEN` | Dashboard (verify bot is in guild) |
| `SESSION_SECRET` | Dashboard session cookie |
| `PLATFORM_ADMIN_USER_IDS` | Discord user IDs allowed on `/admin` |
| `NEXT_PUBLIC_APP_URL` | Dashboard OAuth redirect (production) |

## Deploy dashboard to Vercel

The bot stays on your game panel (or anywhere Node runs). Only the `web/` app goes to Vercel.

### 1. Push to GitHub

Commit and push the repo (including `src/db.js` and the `web/` folder if you use the dashboard).

### 2. Import project in Vercel

1. [vercel.com/new](https://vercel.com/new) → import your repo.
2. **Root Directory:** click Edit → set to **`web`** (required).
3. Framework should auto-detect **Next.js**.

### 3. Environment variables

In Vercel → Project → **Settings → Environment Variables**, add:

| Name | Value |
|------|--------|
| `MONGODB_URI` | Your MongoDB connection string |
| `MONGODB_DB` | `degeneratebot` (or your DB name) |
| `DISCORD_CLIENT_ID` | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | Discord application client secret |
| `DISCORD_TOKEN` | Bot token (same as on the game panel) |
| `SESSION_SECRET` | Random 32+ character string |
| `PLATFORM_ADMIN_USER_IDS` | Your Discord user ID (platform admin) |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` |

Add the same callback URL in Discord OAuth2: `https://your-project.vercel.app/api/auth/callback`.

Apply to **Production**, **Preview**, and **Development**.

**MongoDB Atlas:** Network Access → allow `0.0.0.0/0` so serverless functions can connect.

### 4. Deploy

Deploy. Your site will be at `https://your-project.vercel.app`.

The bot and dashboard must use the **same** `MONGODB_URI` and `MONGODB_DB`.

### Troubleshooting

- **Build fails / module not found:** confirm Root Directory is `web`, not the repo root.
- **Empty guild list:** bot is not writing to the same MongoDB database as Vercel env vars.
- **500 on API routes:** check Vercel → Deployments → Functions logs; usually a bad `MONGODB_URI` or Atlas firewall.
