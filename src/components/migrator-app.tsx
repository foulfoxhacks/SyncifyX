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
  Upload
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

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "matched", label: "Matched" },
  { key: "needs_review", label: "Needs Review" },
  { key: "no_match", label: "No Match" },
  { key: "skipped", label: "Skipped" }
];

export function MigratorApp() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(nextFilter = filter) {
    const [statusResponse, itemsResponse] = await Promise.all([
      fetch("/api/connections"),
      fetch(`/api/matches?status=${nextFilter}`)
    ]);
    setStatus(await statusResponse.json());
    const data = (await itemsResponse.json()) as { items: ReviewItem[] };
    setItems(data.items);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const connected = params.get("connected");
    if (error) setMessage(error);
    if (connected) setMessage(`${connected} connected.`);
    refresh().catch((error) => setMessage(error.message));
  }, []);

  async function runAction<T>(action: BusyAction, url: string, success: (data: T) => string) {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");
      setMessage(success(data as T));
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function updateAccepted(videoId: string, spotifyTrackId: string | null) {
    const response = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId, spotifyTrackId })
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Could not update match.");
      return;
    }
    await refresh();
  }

  const importReady = useMemo(
    () => items.filter((item) => item.matches.some((match) => match.accepted)).length,
    [items]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Music2 size={22} aria-hidden />
          </div>
          YouTube Music to Spotify
        </div>
        <p className="sidebar-copy">
          Rescue your YouTube Music liked songs and rebuild them on Spotify without
          manually hunting every track.
        </p>
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
              This app targets YouTube Music liked-song behavior through the
              authenticated YouTube Data API playlist data, then builds a Spotify
              playlist from confirmed matches.
            </p>
          </div>
          <div className="status-pills">
            <span className={`pill ${status?.google ? "ok" : ""}`}>
              <CheckCircle2 size={16} aria-hidden />
              Google {status?.google ? "connected" : "needed"}
            </span>
            <span className={`pill ${status?.spotify ? "ok" : ""}`}>
              <CheckCircle2 size={16} aria-hidden />
              Spotify {status?.spotify ? "connected" : "needed"}
            </span>
          </div>
        </div>

        {message ? <div className="notice">{message}</div> : null}

        <section className="panel" aria-label="Migration controls">
          <div className="toolbar">
            <div className="toolbar-title">
              <h2>Migration</h2>
              <span>Connect, fetch, score, review, then create the playlist.</span>
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
                  runAction("sync", "/api/youtube/sync", (data: { count: number }) =>
                    `Fetched ${data.count} liked songs.`
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
                  runAction("match", "/api/matches/run", (data: { searched: number }) =>
                    `Searched Spotify for ${data.searched} songs.`
                  )
                }
                title="Search Spotify and score matches"
              >
                {busy === "match" ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />}
                Match
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
              <span>{items.length} songs shown. Accepted tracks are queued for import.</span>
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
            {items.length === 0 ? (
              <div className="empty">
                <ListMusic size={34} aria-hidden />
                <p>Fetch liked songs to start filling the review queue.</p>
              </div>
            ) : (
              items.map((item) => (
                <ReviewRow key={item.videoId} item={item} onAccept={updateAccepted} />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Step({
  icon,
  label,
  done
}: {
  icon: ReactNode;
  label: string;
  done?: boolean;
}) {
  return (
    <div className="step">
      <span className="step-icon">{done ? <CheckCircle2 size={16} /> : icon}</span>
      <span>{label}</span>
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
  onAccept
}: {
  item: ReviewItem;
  onAccept: (videoId: string, spotifyTrackId: string | null) => void;
}) {
  const accepted = item.matches.find((match) => match.accepted)?.spotifyTrackId ?? "";
  const best = item.matches[0];

  return (
    <div className="row">
      {item.thumbnail ? (
        <img className="thumb" src={item.thumbnail} alt="" />
      ) : (
        <div className="thumb" aria-hidden />
      )}
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
              {best.albumName} · {best.reason}
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
