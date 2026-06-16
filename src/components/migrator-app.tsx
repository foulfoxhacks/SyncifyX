"use client";

import {
  CheckCircle2,
  Download,
  ExternalLink,
  ListMusic,
  Loader2,
  Music2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MatchStatus, ReviewItem } from "@/lib/types";

type ConnectionStatus = {
  google: boolean;
  spotify: boolean;
  counts: {
    total: number;
    matched: number;
    needsReview: number;
    noMatch: number;
    skipped: number;
  };
};

type BusyAction = "sync" | "match" | "import" | null;
type Filter = MatchStatus | "all";
type SortMode = "position" | "confidence" | "needs_review" | "accepted";

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "matched", label: "Matched" },
  { key: "needs_review", label: "Needs Review" },
  { key: "no_match", label: "No Match" },
  { key: "skipped", label: "Skipped" }
];

const emptyStatus: ConnectionStatus = {
  google: false,
  spotify: false,
  counts: {
    total: 0,
    matched: 0,
    needsReview: 0,
    noMatch: 0,
    skipped: 0
  }
};

export function MigratorApp() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("needs_review");
  const [batchSize, setBatchSize] = useState(50);
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(
    nextFilter = filter,
    retries = 0,
    expectedProvider?: "google" | "spotify"
  ): Promise<void> {
    const [statusData, itemsData] = await Promise.all([
      apiRequest<ConnectionStatus>(`/api/connections?t=${Date.now()}`),
      apiRequest<{ items: ReviewItem[] }>(`/api/matches?status=${nextFilter}&t=${Date.now()}`)
    ]);

    const expectedProviderMissing =
      expectedProvider === "google"
        ? !statusData.google
        : expectedProvider === "spotify"
          ? !statusData.spotify
          : !statusData.google && !statusData.spotify;

    if (retries > 0 && expectedProviderMissing) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return refresh(nextFilter, retries - 1, expectedProvider);
    }

    setStatus(statusData);
    setItems(itemsData.items);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const connected = params.get("connected");
    if (error) setMessage(error);
    if (connected) setMessage(`${capitalize(connected)} connected. Refreshing account status...`);
    if (error || connected) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    refresh(
      filter,
      connected === "google" || connected === "spotify" ? 4 : 0,
      connected === "google" || connected === "spotify" ? connected : undefined
    ).catch((error) => {
      setStatus(emptyStatus);
      setItems([]);
      setMessage(error.message);
    });
  }, []);

  async function runAction<T>(
    action: BusyAction,
    url: string,
    success: (data: T) => string,
    body?: unknown
  ) {
    setBusy(action);
    setMessage(null);
    try {
      const data = await apiRequest<T>(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      setMessage(success(data));
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function findBest(item: ReviewItem) {
    setBusyVideoId(item.videoId);
    setMessage(null);
    try {
      const data = await apiRequest<{ searched: number }>("/api/matches/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: item.videoId, limit: 1, useAi })
      });
      setMessage(data.searched ? `Refreshed best match for "${item.title}".` : "No row was matched.");
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyVideoId(null);
    }
  }

  async function updateAccepted(videoId: string, spotifyTrackId: string | null) {
    try {
      await apiRequest<{ ok: boolean }>("/api/matches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, spotifyTrackId })
      });
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  const displayedItems = useMemo(() => sortItems(items, sortMode), [items, sortMode]);
  const importReady = useMemo(
    () => items.filter((item) => item.matches.some((match) => match.accepted)).length,
    [items]
  );
  const reviewed = (status?.counts.matched ?? 0) + (status?.counts.noMatch ?? 0) + (status?.counts.skipped ?? 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Music2 size={22} aria-hidden />
          </div>
          SyncifyX
        </div>
        <p className="sidebar-copy">
          Move YouTube Music likes into Spotify with reviewable matches and safe batch imports.
        </p>
        <div className="feature-stack" aria-label="Available features">
          <Feature icon={<Search size={15} />} label="LM playlist source" />
          <Feature icon={<SlidersHorizontal size={15} />} label="Batch matching" />
          <Feature icon={<Wand2 size={15} />} label="Find best match" />
          <Feature icon={<Sparkles size={15} />} label="Optional AI parse assist" />
        </div>
        <a
          className="sidebar-link"
          href="https://github.com/foulfoxhacks/SyncifyX/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} aria-hidden />
          Changelog
        </a>
        <div className="step-list" aria-label="Import steps">
          <Step icon={<ExternalLink size={16} />} label="Connect Google" done={status?.google} />
          <Step icon={<ExternalLink size={16} />} label="Connect Spotify" done={status?.spotify} />
          <Step icon={<Download size={16} />} label="Fetch liked songs" done={Boolean(status?.counts.total)} />
          <Step icon={<Search size={16} />} label="Review matches" done={Boolean(status?.counts.matched)} />
          <Step icon={<Upload size={16} />} label="Create playlist" />
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Move liked songs from YouTube Music into Spotify.</h1>
            <p className="lede">
              Fetch the YouTube Music Liked Music list, score Spotify candidates, review uncertain rows,
              then import accepted tracks into a new playlist.
            </p>
          </div>
          <div className="status-pills">
            <span className={`pill ${status?.google ? "ok" : ""}`}>
              <CheckCircle2 size={16} aria-hidden />
              Google {status ? (status.google ? "connected" : "needed") : "checking"}
            </span>
            <span className={`pill ${status?.spotify ? "ok" : ""}`}>
              <CheckCircle2 size={16} aria-hidden />
              Spotify {status ? (status.spotify ? "connected" : "needed") : "checking"}
            </span>
          </div>
        </div>

        {message ? <div className="notice">{message}</div> : null}

        <section className="panel command-panel" aria-label="Migration controls">
          <div className="toolbar">
            <div className="toolbar-title">
              <h2>Migration</h2>
              <span>{reviewed} reviewed. {importReady} accepted for import.</span>
            </div>
            <div className="actions">
              <a className="button" href="/api/auth/google/start" title="Connect Google">
                <ExternalLink size={17} aria-hidden />
                Google
              </a>
              <a className="button" href="/api/auth/spotify/start" title="Connect Spotify">
                <ExternalLink size={17} aria-hidden />
                Spotify
              </a>
              <button
                className="button"
                disabled={!status?.google || busy !== null}
                onClick={() =>
                  runAction("sync", "/api/youtube/sync", (data: { count: number; playlistId: string }) =>
                    `Fetched ${data.count} songs from ${data.playlistId}.`
                  )
                }
                title="Fetch YouTube Music liked songs"
              >
                {busy === "sync" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}
                Fetch
              </button>
              <button
                className="button"
                disabled={!status?.spotify || !status?.counts.total || busy !== null}
                onClick={() =>
                  runAction(
                    "match",
                    "/api/matches/run",
                    (data: { searched: number }) => `Matched ${data.searched} songs in this batch.`,
                    { limit: batchSize, useAi }
                  )
                }
                title="Search Spotify and score the next batch"
              >
                {busy === "match" ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />}
                Match {batchSize}
              </button>
              <button
                className="button primary"
                disabled={!importReady || busy !== null}
                onClick={() =>
                  runAction("import", "/api/import/spotify", (data: { count: number; url: string | null }) =>
                    data.url
                      ? `Created playlist with ${data.count} tracks: ${data.url}`
                      : `Created playlist with ${data.count} tracks.`
                  )
                }
                title="Create Spotify playlist"
              >
                {busy === "import" ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}
                Import
              </button>
            </div>
          </div>

          <div className="option-bar" aria-label="Matching options">
            <label>
              <span>Batch</span>
              <select className="select compact" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select className="select compact" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="needs_review">Review first</option>
                <option value="confidence">Best score</option>
                <option value="accepted">Accepted first</option>
                <option value="position">YouTube order</option>
              </select>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={useAi} onChange={(event) => setUseAi(event.target.checked)} />
              AI parse assist
            </label>
          </div>

          <div className="content-grid" aria-label="Match summary">
            <Stat value={status?.counts.total ?? 0} label="Fetched" />
            <Stat value={status?.counts.matched ?? 0} label="Matched" />
            <Stat value={status?.counts.needsReview ?? 0} label="Needs Review" />
            <Stat value={status?.counts.noMatch ?? 0} label="No Match" />
          </div>
        </section>

        <section className="panel" aria-label="Review matches">
          <div className="toolbar">
            <div className="toolbar-title">
              <h2>Review</h2>
              <span>{displayedItems.length} songs shown. Accepted tracks are queued for import.</span>
            </div>
          </div>
          <div className="filters">
            {filters.map((item) => (
              <button
                key={item.key}
                className={`filter-button ${filter === item.key ? "active" : ""}`}
                onClick={() => {
                  setFilter(item.key);
                  refresh(item.key).catch((error) => setMessage(error.message));
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="review-list">
            {displayedItems.length === 0 ? (
              <div className="empty">
                <ListMusic size={34} aria-hidden />
                <p>Fetch liked songs to start filling the review queue.</p>
              </div>
            ) : (
              displayedItems.map((item) => (
                <ReviewRow
                  key={item.videoId}
                  item={item}
                  busy={busyVideoId === item.videoId}
                  onAccept={updateAccepted}
                  onFindBest={findBest}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Step({ icon, label, done }: { icon: ReactNode; label: string; done?: boolean }) {
  return (
    <div className="step">
      <span className="step-icon">{done ? <CheckCircle2 size={16} /> : icon}</span>
      <span>{label}</span>
    </div>
  );
}

function Feature({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="feature">
      <span>{icon}</span>
      <b>{label}</b>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function ReviewRow({
  item,
  busy,
  onAccept,
  onFindBest
}: {
  item: ReviewItem;
  busy: boolean;
  onAccept: (videoId: string, spotifyTrackId: string | null) => void;
  onFindBest: (item: ReviewItem) => void;
}) {
  const accepted = item.matches.find((match) => match.accepted)?.spotifyTrackId ?? "";
  const best = item.matches[0];

  return (
    <div className="row">
      {item.thumbnail ? <img className="thumb" src={item.thumbnail} alt="" /> : <div className="thumb" aria-hidden />}
      <div className="title-block">
        <span className={`badge ${item.matchStatus}`}>{labelStatus(item.matchStatus)}</span>
        <strong title={item.title}>{item.title}</strong>
        <span className="meta" title={item.channelTitle}>
          {item.channelTitle}
        </span>
      </div>
      <div className="match-box">
        {best ? (
          <>
            <div className="match-top">
              <span className="score">{best.confidenceScore}</span>
              <span className="match-name" title={`${best.trackName} by ${best.artistName}`}>
                {best.trackName} by {best.artistName}
              </span>
            </div>
            <span className="meta" title={best.reason}>
              {best.albumName} - {best.reason}
            </span>
            <select
              className="select"
              value={accepted}
              onChange={(event) => onAccept(item.videoId, event.target.value || null)}
              aria-label={`Select Spotify match for ${item.title}`}
            >
              <option value="">No Spotify match</option>
              {item.matches.map((match) => (
                <option key={match.spotifyTrackId} value={match.spotifyTrackId}>
                  {match.trackName} - {match.artistName} ({match.confidenceScore})
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="meta">No Spotify candidates yet.</span>
        )}
      </div>
      <div className="row-actions">
        <button className="icon-button" disabled={busy} onClick={() => onFindBest(item)} title="Find best match">
          {busy ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={Boolean(accepted)}
            disabled={!best}
            onChange={(event) => onAccept(item.videoId, event.target.checked ? best.spotifyTrackId : null)}
          />
          Import
        </label>
      </div>
    </div>
  );
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-cache");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers,
      signal: init?.signal ?? controller.signal
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Request timed out while loading SyncifyX. Check the Vercel deployment logs and database connection variables.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const data = parseResponseText(text, contentType);

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : text || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function parseResponseText(text: string, contentType: string) {
  if (!text || !contentType.includes("application/json")) return text;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sortItems(items: ReviewItem[], sortMode: SortMode) {
  const priority: Record<MatchStatus, number> = {
    needs_review: 0,
    no_match: 1,
    matched: 2,
    skipped: 3
  };

  return [...items].sort((a, b) => {
    if (sortMode === "position") return a.position - b.position;
    if (sortMode === "confidence") {
      return (b.matches[0]?.confidenceScore ?? -1) - (a.matches[0]?.confidenceScore ?? -1);
    }
    if (sortMode === "accepted") {
      return Number(b.matches.some((match) => match.accepted)) - Number(a.matches.some((match) => match.accepted));
    }
    return priority[a.matchStatus] - priority[b.matchStatus] || a.position - b.position;
  });
}

function labelStatus(status: MatchStatus) {
  switch (status) {
    case "matched":
      return "Matched";
    case "needs_review":
      return "Needs Review";
    case "no_match":
      return "No Match";
    case "skipped":
      return "Skipped";
  }
}
