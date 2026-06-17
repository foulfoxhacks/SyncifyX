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
  Settings2,
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
type ThemeName = "syncify" | "midnight" | "studio" | "contrast";
type BatchMode = "preset" | "custom" | "all";
type ImportDestination = "liked" | "playlist" | "both" | "existing";
type ApiRequestInit = RequestInit & {
  timeoutMessage?: string;
  timeoutMs?: number;
};
type MigrationOption = {
  id: string;
  label: string;
  description?: string;
  trackCount?: number | null;
};

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "matched", label: "Matched" },
  { key: "needs_review", label: "Needs Review" },
  { key: "no_match", label: "No Match" },
  { key: "skipped", label: "Skipped" }
];

const themes: { key: ThemeName; label: string }[] = [
  { key: "syncify", label: "Syncify Red" },
  { key: "midnight", label: "Midnight" },
  { key: "studio", label: "Studio" },
  { key: "contrast", label: "High Contrast" }
];

export function MigratorApp() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("needs_review");
  const [batchSize, setBatchSize] = useState(50);
  const [batchMode, setBatchMode] = useState<BatchMode>("preset");
  const [customBatchSize, setCustomBatchSize] = useState(75);
  const [theme, setTheme] = useState<ThemeName>("syncify");
  const [useAi, setUseAi] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [sourceOptions, setSourceOptions] = useState<MigrationOption[]>([]);
  const [destinationId, setDestinationId] = useState("liked");
  const [destinationOptions, setDestinationOptions] = useState<MigrationOption[]>([]);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(
    nextFilter = filter,
    retries = 0,
    expectedProvider?: "google" | "spotify"
  ): Promise<void> {
    const statusData = await apiRequest<ConnectionStatus>(`/api/connections?t=${Date.now()}`, {
      timeoutMs: 60_000,
      timeoutMessage: "SyncifyX is still waking up the database. Refresh in a moment if this message stays visible."
    });
    const hasReviewQueue = statusData.counts.total > 0;
    const itemsData = hasReviewQueue
      ? await apiRequest<{ items: ReviewItem[] }>(`/api/matches?status=${nextFilter}&t=${Date.now()}`, {
        timeoutMs: 60_000,
        timeoutMessage: "SyncifyX is still loading the review queue. Refresh in a moment if this message stays visible."
      })
      : { items: [] };

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
    ).catch((loadError) => {
      if (error || connected) setMessage(loadError.message);
    });
  }, []);

  useEffect(() => {
    if (status?.google) {
      loadYouTubeSources().catch((error) => setMessage(error.message));
    }
    if (status?.spotify) {
      loadSpotifyDestinations().catch((error) => setMessage(error.message));
    }
  }, [status?.google, status?.spotify]);

  async function loadYouTubeSources() {
    const data = await apiRequest<{ sources: MigrationOption[] }>(`/api/youtube/sources?t=${Date.now()}`);
    setSourceOptions(data.sources);
    setSourceId((current) => current || data.sources[0]?.id || "");
  }

  async function loadSpotifyDestinations() {
    const data = await apiRequest<{ destinations: MigrationOption[] }>(`/api/spotify/destinations?t=${Date.now()}`);
    setDestinationOptions(data.destinations);
    setDestinationId((current) =>
      data.destinations.some((option) => option.id === current) ? current : data.destinations[0]?.id || "liked"
    );
  }

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
  const effectiveBatch = batchMode === "all" ? "all" : batchMode === "custom" ? clampBatch(customBatchSize) : batchSize;
  const matchLabel = effectiveBatch === "all" ? "Match all" : `Match ${effectiveBatch}`;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Music2 size={22} aria-hidden />
          </div>
          SyncifyX
        </div>
        <p className="sidebar-copy">
          Move YouTube Music likes into Spotify Liked Songs with reviewable matches and safe batch imports.
        </p>
        <div className="feature-stack" aria-label="Available features">
          <Feature icon={<Search size={15} />} label="Selectable sources" />
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
          <Step icon={<Upload size={16} />} label="Save to Liked Songs" />
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Move liked songs from YouTube Music into Spotify.</h1>
            <p className="lede">
              Choose a YouTube Music source, score Spotify candidates, review uncertain rows,
              then save accepted tracks into the Spotify destination you choose.
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

        <section className="control-bar" aria-label="Main controls">
          <div className="control-summary">
            <b>{reviewed} reviewed</b>
            <span>{importReady} accepted</span>
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
                runAction(
                  "sync",
                  "/api/youtube/sync",
                  (data: { count: number; playlistId: string }) =>
                    `Fetched ${data.count} songs from ${sourceLabel(sourceOptions, data.playlistId)}.`,
                  { sourcePlaylistId: sourceId || undefined }
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
                  (data: { searched: number; remaining: number }) =>
                    `Matched ${data.searched} songs. ${data.remaining} still need review.`,
                  { limit: effectiveBatch, useAi }
                )
              }
              title="Search Spotify and score the next batch"
            >
              {busy === "match" ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />}
              {matchLabel}
            </button>
            <button
              className="button primary"
              disabled={!importReady || busy !== null}
              onClick={() =>
                runAction(
                  "import",
                  "/api/import/spotify",
                  (data: { count: number; destination: ImportDestination; url: string | null }) =>
                    importMessage(data.count, data.destination, data.url),
                  { destinationId }
                )
              }
              title="Save accepted tracks to Spotify"
            >
              {busy === "import" ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}
              {destinationButtonLabel(destinationId)}
            </button>
            <button
              className="button"
              onClick={() => setCustomizationOpen((open) => !open)}
              title="Open customization menu"
            >
              <Settings2 size={17} aria-hidden />
              Customize
            </button>
          </div>
        </section>

        {customizationOpen ? (
          <section className="customization-drawer" aria-label="Customization menu">
            <div className="drawer-section">
              <h2>Theme</h2>
              <div className="theme-swatches">
                {themes.map((item) => (
                  <button
                    key={item.key}
                    className={`swatch swatch-${item.key} ${theme === item.key ? "active" : ""}`}
                    onClick={() => setTheme(item.key)}
                    title={item.label}
                    aria-label={`Use ${item.label} theme`}
                  />
                ))}
              </div>
            </div>
            <div className="drawer-section">
              <h2>Batch Mode</h2>
              <div className="drawer-controls">
                <label>
                  <span>Mode</span>
                  <select className="select compact" value={batchMode} onChange={(event) => setBatchMode(event.target.value as BatchMode)}>
                    <option value="preset">Preset</option>
                    <option value="custom">Custom</option>
                    <option value="all">All</option>
                  </select>
                </label>
                {batchMode === "preset" ? (
                  <label>
                    <span>Size</span>
                    <select className="select compact" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))}>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                    </select>
                  </label>
                ) : null}
                {batchMode === "custom" ? (
                  <label>
                    <span>Size</span>
                    <input
                      className="number-input"
                      type="number"
                      min={1}
                      max={500}
                      value={customBatchSize}
                      onChange={(event) => setCustomBatchSize(Number(event.target.value))}
                    />
                  </label>
                ) : null}
              </div>
              {batchMode === "all" ? <span className="option-note">All can run long on serverless.</span> : null}
            </div>
            <div className="drawer-section">
              <h2>Review</h2>
              <div className="drawer-controls">
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
            </div>
            <div className="drawer-section">
              <h2>Source</h2>
              <div className="drawer-controls">
                <label>
                  <span>Pull from</span>
                  <select
                    className="select compact"
                    value={sourceId}
                    disabled={!status?.google || sourceOptions.length === 0}
                    onChange={(event) => setSourceId(event.target.value)}
                  >
                    {sourceSelectOptions(sourceOptions).map((option) => (
                      <option key={option.id} value={option.id}>
                        {optionLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <span className="option-note">Changing the source replaces the current review queue on the next fetch.</span>
            </div>
            <div className="drawer-section">
              <h2>Destination</h2>
              <div className="drawer-controls">
                <label>
                  <span>Send to</span>
                  <select
                    className="select compact"
                    value={destinationId}
                    disabled={!status?.spotify}
                    onChange={(event) => setDestinationId(event.target.value)}
                  >
                    {destinationSelectOptions(destinationOptions).map((option) => (
                      <option key={option.id} value={option.id}>
                        {optionLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <span className="option-note">Liked Songs requires Spotify library write access. Existing playlists require playlist edit access.</span>
            </div>
          </section>
        ) : null}

        <section className="panel command-panel" aria-label="Migration controls">
          <div className="content-grid" aria-label="Match summary">
            <Stat value={status?.counts.total ?? 0} label="Fetched" />
            <Stat value={status?.counts.matched ?? 0} label="Matched" />
            <Stat value={status?.counts.needsReview ?? 0} label="Needs Review" />
            <Stat value={status?.counts.noMatch ?? 0} label="No Match" />
          </div>
        </section>

        <section className="info-grid" aria-label="About and customization">
          <div className="info-panel">
            <h2>About The Developer</h2>
            <p>
              Built by foulfoxhacks as a practical music rescue tool: transparent matching,
              review-first saves, and enough personality to make a migration patch feel alive.
            </p>
          </div>
          <div className="info-panel">
              <h2>Customization</h2>
              <p>
              Pick a theme, choose source and destination lists, tune batch size, sort the queue, toggle AI parsing, and refresh
              individual rows when a song deserves a closer look.
              </p>
          </div>
          <div className="info-panel">
            <h2>Migration Modes</h2>
            <p>
              Presets are safest. Custom batches let you tune speed. All mode is available for
              quick passes when the deployment has enough runtime. The primary destination is Spotify Liked Songs.
            </p>
          </div>
        </section>

        <section className="panel" aria-label="Review matches">
          <div className="toolbar">
            <div className="toolbar-title">
              <h2>Review</h2>
              <span>{displayedItems.length} songs shown. Accepted tracks are queued for Spotify Liked Songs.</span>
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
          Save
        </label>
      </div>
    </div>
  );
}

async function apiRequest<T>(url: string, init?: ApiRequestInit): Promise<T> {
  const { timeoutMessage, timeoutMs = 45_000, ...fetchInit } = init ?? {};
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-cache");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...fetchInit,
      headers,
      signal: fetchInit.signal ?? controller.signal
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(
        timeoutMessage ??
          "SyncifyX took too long to respond. This is usually a cold start or database wake-up; wait a moment and try again."
      );
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

function clampBatch(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(500, Math.max(1, Math.round(value)));
}

function importMessage(count: number, destination: ImportDestination, url: string | null) {
  if (destination === "liked") {
    return `Saved ${count} tracks to Spotify Liked Songs.`;
  }

  if (destination === "existing") {
    return `Added ${count} tracks to the selected Spotify playlist.`;
  }

  if (destination === "both") {
    return url
      ? `Saved ${count} tracks to Spotify Liked Songs and created a playlist: ${url}`
      : `Saved ${count} tracks to Spotify Liked Songs and created a playlist.`;
  }

  return url
    ? `Created playlist with ${count} tracks: ${url}`
    : `Created playlist with ${count} tracks.`;
}

function destinationButtonLabel(destinationId: string) {
  if (destinationId === "playlist") return "Create Playlist";
  if (destinationId.startsWith("existing:")) return "Add to Playlist";
  return "Save Likes";
}

function sourceSelectOptions(options: MigrationOption[]) {
  return options.length
    ? options
    : [{ id: "", label: "Connect Google to load sources", description: "Google needed" }];
}

function destinationSelectOptions(options: MigrationOption[]) {
  return options.length
    ? options
    : [{ id: "liked", label: "Spotify Liked Songs", description: "Spotify needed" }];
}

function optionLabel(option: MigrationOption) {
  return option.trackCount === null || option.trackCount === undefined
    ? option.label
    : `${option.label} (${option.trackCount})`;
}

function sourceLabel(options: MigrationOption[], playlistId: string) {
  return options.find((option) => option.id === playlistId)?.label ?? playlistId;
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
