"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spinner } from "@heroui/react";

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom", disabled: true },
];

const TRACKER_TABS = [
  {
    id: "leaderboards",
    label: "Leaderboards",
    enabled: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="M3 14h2V8H3v6Zm4 0h2V5H7v9Zm4 0h2V3h-2v11Zm4 0h2V10h-2v4Z" />
      </svg>
    ),
  },
  {
    id: "user-daily",
    label: "User Daily",
    enabled: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 17.5v-.5A4 4 0 0 1 8 13h4a4 4 0 0 1 4 4v.5H4Z" />
      </svg>
    ),
  },
  {
    id: "channel-daily",
    label: "Channel Daily",
    enabled: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9ZM6 7h8v1.5H6V7Zm0 3h5v1.5H6V10Z" />
      </svg>
    ),
  },
  {
    id: "games",
    label: "Games Played",
    enabled: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="M6 10.5h2v-2H6v2Zm1-1h0v0ZM13 9.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm1.25-.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM4 8.5A2.5 2.5 0 0 1 6.5 6h7A2.5 2.5 0 0 1 16 8.5v3A2.5 2.5 0 0 1 13.5 14h-7A2.5 2.5 0 0 1 4 11.5v-3Z" />
      </svg>
    ),
  },
  {
    id: "voice",
    label: "Voice Sessions",
    enabled: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="M10 11.5a2.5 2.5 0 0 0 2.5-2.5V5.5a2.5 2.5 0 1 0-5 0V9a2.5 2.5 0 0 0 2.5 2.5ZM6.5 9a3.5 3.5 0 0 0 7 0H15a5 5 0 0 1-10 0h1.5Z M10 13v2.5M7.5 17.5h5" />
      </svg>
    ),
  },
  {
    id: "joins",
    label: "Member Joins",
    enabled: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="M10 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 16.5v-.75A3.25 3.25 0 0 1 7.25 12.5h5.5A3.25 3.25 0 0 1 16 15.75v.75H4Zm9-9.25h3.25V8H13v-.75Zm0-2.5h3.25V5H13V4.25Z" />
      </svg>
    ),
  },
  {
    id: "economy",
    label: "Economy Balances",
    enabled: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="M10 2a6 6 0 1 0 0 12A6 6 0 0 0 10 2Zm0 2.5a.75.75 0 0 1 .75.75v.19a2.75 2.75 0 0 1 1.56 4.98l-1.06.53a.75.75 0 1 1-.68-1.34l1.06-.53A1.25 1.25 0 1 0 10 7.25a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75Zm0 6.5a.75.75 0 0 1 .75.75v.25a.75.75 0 1 1-1.5 0v-.25a.75.75 0 0 1 .75-.75Z" />
      </svg>
    ),
  },
  {
    id: "boosts",
    label: "Boost Events",
    enabled: false,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
        <path d="m10 2 1.8 3.6L16 6.5l-2.8 2.7.66 3.87L10 11.2l-3.86 2.02.66-3.87L4 6.5l4.2-.9L10 2Z" />
      </svg>
    ),
  },
];

function formatVoice(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatMessages(count) {
  return Number(count ?? 0).toLocaleString();
}

function RankBadge({ rank }) {
  if (rank === 1) {
    return <span className="rank-medal rank-medal-gold">{rank}</span>;
  }
  if (rank === 2) {
    return <span className="rank-medal rank-medal-silver">{rank}</span>;
  }
  if (rank === 3) {
    return <span className="rank-medal rank-medal-bronze">{rank}</span>;
  }
  return <span className="rank-plain">{rank}</span>;
}

function rowHighlightClass(rank) {
  if (rank === 1) return "rank-row rank-row-gold";
  if (rank === 2) return "rank-row rank-row-silver";
  if (rank === 3) return "rank-row rank-row-bronze";
  return "rank-row";
}

function UserRow({ rank, profile, value }) {
  return (
    <div className={rowHighlightClass(rank)}>
      <RankBadge rank={rank} />
      <img
        src={profile?.avatar_url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full bg-surface-tertiary object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">
          {profile?.display_name ?? "Unknown"}
        </p>
        <p className="truncate text-xs text-muted">@{profile?.username ?? "unknown"}</p>
      </div>
      <p className="rank-value shrink-0 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function GameIcon({ name, imageUrl }) {
  const initial = (name ?? "?").charAt(0).toUpperCase();
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary text-sm font-bold text-accent">
        {initial}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt=""
      className="game-icon shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

function GameRow({ rank, game }) {
  return (
    <div className={rowHighlightClass(rank)}>
      <RankBadge rank={rank} />
      <GameIcon name={game.activity_name} imageUrl={game.image_url} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{game.activity_name}</p>
        <p className="text-xs text-muted">
          {game.player_count} player{game.player_count === 1 ? "" : "s"}
        </p>
      </div>
      <p className="rank-value shrink-0 text-sm font-semibold tabular-nums">
        {formatVoice(game.total_seconds)}
      </p>
    </div>
  );
}

function ColumnPager({ page, totalPages, total, onPrev, onNext }) {
  return (
    <div className="rank-column-footer">
      <span>
        {page + 1} / {totalPages} · {total} total
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          className="rank-pager-btn"
          disabled={page <= 0}
          onClick={onPrev}
          aria-label="Previous page"
        >
          ‹
        </button>
        <button
          type="button"
          className="rank-pager-btn"
          disabled={page >= totalPages - 1}
          onClick={onNext}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function RankingColumn({ title, icon, children, pager }) {
  return (
    <div className="rank-column">
      <div className="rank-column-header">
        <span className="text-muted" aria-hidden>
          {icon}
        </span>
        <span>{title}</span>
      </div>
      <div className="rank-column-body">{children}</div>
      {pager}
    </div>
  );
}

const COLUMN_ICONS = {
  messages: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v6a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 2.5V14H4.5A1.5 1.5 0 0 1 3 12.5v-7Z" />
    </svg>
  ),
  voice: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10 11a2 2 0 0 0 2-2V5a2 2 0 1 0-4 0v4a2 2 0 0 0 2 2Zm-3.5-2a3.5 3.5 0 0 0 7 0H15a5 5 0 0 1-10 0h1.5ZM10 13v2M7 16.5h6" />
    </svg>
  ),
  games: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M6 10h2V8H6v2Zm1-1h0v0ZM13 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm1-1a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM4 8.5A2.5 2.5 0 0 1 6.5 6h7A2.5 2.5 0 0 1 16 8.5v3A2.5 2.5 0 0 1 13.5 14h-7A2.5 2.5 0 0 1 4 11.5v-3Z" />
    </svg>
  ),
};

export default function RankingsPanel({ guildId, guildName }) {
  const [period, setPeriod] = useState("7d");
  const [messagesPage, setMessagesPage] = useState(0);
  const [voicePage, setVoicePage] = useState(0);
  const [gamesPage, setGamesPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRankings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        period,
        messagesPage: String(messagesPage),
        voicePage: String(voicePage),
        gamesPage: String(gamesPage),
      });
      let res = await fetch(`/api/guilds/${guildId}/rankings?${params}`);
      if (res.status === 401 || res.status === 502) {
        await fetch("/api/auth/sync-guilds", { method: "POST" });
        res = await fetch(`/api/guilds/${guildId}/rankings?${params}`);
      }
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error === "relogin_required"
            ? "Session expired — log out and sign in again."
            : "Failed to load rankings"
        );
      }
      setData(json);
    } catch (err) {
      setError(err.message || "Failed to load rankings");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [guildId, period, messagesPage, voicePage, gamesPage]);

  useEffect(() => {
    loadRankings();
  }, [loadRankings]);

  function changePeriod(next) {
    setPeriod(next);
    setMessagesPage(0);
    setVoicePage(0);
    setGamesPage(0);
  }

  const profiles = data?.profiles ?? {};
  const rangeLabel = data?.range?.label ?? "Last 7 days";

  const recordCount = useMemo(() => {
    if (!data) return 0;
    return (data.messages?.total ?? 0) + (data.voice?.total ?? 0) + (data.games?.total ?? 0);
  }, [data]);

  return (
    <div className="activity-tracker flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="tracker-brand-label">{guildName ?? "StatX"}</p>
          <h1 className="tracker-title">Activity Tracker</h1>
          <p className="tracker-subtitle">Messages, voice, and presence.</p>
        </div>
        {data ? (
          <div className="records-badge">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M3 14h2V8H3v6Zm4 0h2V5H7v9Zm4 0h2V3h-2v11Zm4 0h2V10h-2v4Z" />
            </svg>
            <span>{recordCount.toLocaleString()} records</span>
          </div>
        ) : null}
      </div>

      <nav className="tracker-tabs" aria-label="Activity views">
        {TRACKER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={!tab.enabled}
            className={`tracker-tab ${tab.id === "leaderboards" ? "tracker-tab-active" : ""} ${
              !tab.enabled ? "tracker-tab-disabled" : ""
            }`}
            title={tab.enabled ? tab.label : `${tab.label} (coming soon)`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="rankings-toolbar">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Rankings</h2>
            <p className="mt-0.5 text-sm text-muted">
              Members for messages &amp; voice · games ranked by play time · {rangeLabel}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onPress={loadRankings}
            isDisabled={loading}
          >
            <span className="flex items-center gap-1.5">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden
              >
                <path d="M10 3a7 7 0 1 0 7 7h-1.75A5.25 5.25 0 1 1 10 4.75V3Zm0 2.5V3l3 2.5h-2v2.5H10V5.5Z" />
              </svg>
              Refresh
            </span>
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.disabled}
              className={`period-pill ${period === p.id ? "period-pill-active" : ""} ${
                p.disabled ? "period-pill-disabled" : ""
              }`}
              onClick={() => !p.disabled && changePeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
          {data?.plan?.plan === "free" ? (
            <span className="ml-1 text-xs text-warning">Free plan: 90-day max</span>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center gap-3 py-16 text-muted">
          <Spinner size="md" />
          <span>Loading rankings…</span>
        </div>
      ) : data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <RankingColumn
            title="Messages"
            icon={COLUMN_ICONS.messages}
            pager={
              <ColumnPager
                page={data.messages.page}
                totalPages={data.messages.totalPages}
                total={data.messages.total}
                onPrev={() => setMessagesPage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  setMessagesPage((p) => Math.min(data.messages.totalPages - 1, p + 1))
                }
              />
            }
          >
            {data.messages.items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No messages yet</p>
            ) : (
              data.messages.items.map((row, idx) => (
                <UserRow
                  key={row.user_id}
                  rank={data.messages.page * data.pageSize + idx + 1}
                  profile={profiles[row.user_id]}
                  value={formatMessages(row.messages)}
                />
              ))
            )}
          </RankingColumn>

          <RankingColumn
            title="Voice time"
            icon={COLUMN_ICONS.voice}
            pager={
              <ColumnPager
                page={data.voice.page}
                totalPages={data.voice.totalPages}
                total={data.voice.total}
                onPrev={() => setVoicePage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  setVoicePage((p) => Math.min(data.voice.totalPages - 1, p + 1))
                }
              />
            }
          >
            {data.voice.items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No voice time yet</p>
            ) : (
              data.voice.items.map((row, idx) => (
                <UserRow
                  key={row.user_id}
                  rank={data.voice.page * data.pageSize + idx + 1}
                  profile={profiles[row.user_id]}
                  value={formatVoice(row.voice_seconds)}
                />
              ))
            )}
          </RankingColumn>

          <RankingColumn
            title="Games"
            icon={COLUMN_ICONS.games}
            pager={
              <ColumnPager
                page={data.games.page}
                totalPages={data.games.totalPages}
                total={data.games.total}
                onPrev={() => setGamesPage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  setGamesPage((p) => Math.min(data.games.totalPages - 1, p + 1))
                }
              />
            }
          >
            {data.games.items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No game activity yet</p>
            ) : (
              data.games.items.map((row, idx) => (
                <GameRow
                  key={row.activity_name}
                  rank={data.games.page * data.pageSize + idx + 1}
                  game={row}
                />
              ))
            )}
          </RankingColumn>
        </div>
      ) : null}
    </div>
  );
}
