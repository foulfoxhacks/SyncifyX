import { Pool, type PoolClient } from "pg";
import type { MatchStatus, ReviewItem, SpotifyCandidate, YouTubeItem } from "./types";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL. Add a Postgres connection string to .env.local.");
}

const pool =
  globalThis.__syncifyxPgPool ??
  new Pool({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : {
            rejectUnauthorized: false
          }
  });

globalThis.__syncifyxPgPool = pool;

let migrationPromise: Promise<void> | null = null;

export type OAuthToken = {
  userId: string;
  provider: "google" | "spotify";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string | null;
  tokenType: string | null;
};

type YouTubeItemRow = {
  userid: string;
  videoid: string;
  title: string;
  channeltitle: string;
  description: string;
  publishedat: string | null;
  thumbnail: string | null;
  position: number;
  durationms: number | null;
  matchstatus: MatchStatus;
  parsedartist: string | null;
  parsedtitle: string | null;
};

type SpotifyMatchRow = {
  spotifytrackid: string;
  trackname: string;
  artistname: string;
  albumname: string;
  durationms: number | null;
  confidencescore: number;
  accepted: boolean;
  reason: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __syncifyxPgPool: Pool | undefined;
}

export async function ensureSchema() {
  migrationPromise ??= pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at BIGINT NOT NULL,
      scope TEXT,
      token_type TEXT,
      PRIMARY KEY (user_id, provider),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS youtube_items (
      user_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      description TEXT NOT NULL,
      published_at TEXT,
      thumbnail TEXT,
      position INTEGER NOT NULL,
      duration_ms INTEGER,
      match_status TEXT NOT NULL DEFAULT 'needs_review',
      parsed_artist TEXT,
      parsed_title TEXT,
      PRIMARY KEY (user_id, video_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS spotify_matches (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      youtube_video_id TEXT NOT NULL,
      spotify_track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_name TEXT NOT NULL,
      duration_ms INTEGER,
      confidence_score INTEGER NOT NULL,
      accepted BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, youtube_video_id, spotify_track_id),
      FOREIGN KEY (user_id, youtube_video_id) REFERENCES youtube_items(user_id, video_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS imports (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      spotify_playlist_id TEXT NOT NULL,
      playlist_name TEXT NOT NULL,
      track_count INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `).then(() => undefined);

  return migrationPromise;
}

export async function ensureUser(userId: string) {
  await ensureSchema();
  await pool.query("INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [
    userId
  ]);
}

export async function upsertToken(token: OAuthToken) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO oauth_tokens
      (user_id, provider, access_token, refresh_token, expires_at, scope, token_type)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      token_type = EXCLUDED.token_type`,
    [
      token.userId,
      token.provider,
      token.accessToken,
      token.refreshToken,
      token.expiresAt,
      token.scope,
      token.tokenType
    ]
  );
}

export async function getToken(userId: string, provider: "google" | "spotify") {
  await ensureSchema();
  const result = await pool.query(
    `SELECT
      user_id AS "userId",
      provider,
      access_token AS "accessToken",
      refresh_token AS "refreshToken",
      expires_at AS "expiresAt",
      scope,
      token_type AS "tokenType"
     FROM oauth_tokens
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );

  const row = result.rows[0] as OAuthToken | undefined;
  return row ? { ...row, expiresAt: Number(row.expiresAt) } : undefined;
}

export async function getConnectionStatus(userId: string) {
  const [google, spotify] = await Promise.all([
    getToken(userId, "google"),
    getToken(userId, "spotify")
  ]);
  const counts = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE match_status = 'matched')::int AS matched,
      COUNT(*) FILTER (WHERE match_status = 'needs_review')::int AS "needsReview",
      COUNT(*) FILTER (WHERE match_status = 'no_match')::int AS "noMatch",
      COUNT(*) FILTER (WHERE match_status = 'skipped')::int AS skipped
     FROM youtube_items
     WHERE user_id = $1`,
    [userId]
  );

  return {
    google: Boolean(google),
    spotify: Boolean(spotify),
    counts: {
      total: counts.rows[0]?.total ?? 0,
      matched: counts.rows[0]?.matched ?? 0,
      needsReview: counts.rows[0]?.needsReview ?? 0,
      noMatch: counts.rows[0]?.noMatch ?? 0,
      skipped: counts.rows[0]?.skipped ?? 0
    }
  };
}

export async function upsertYouTubeItems(userId: string, items: YouTubeItem[]) {
  await withTransaction(async (client) => {
    for (const item of items) {
      await client.query(
        `INSERT INTO youtube_items
          (user_id, video_id, title, channel_title, description, published_at, thumbnail, position, duration_ms, match_status)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, video_id) DO UPDATE SET
          title = EXCLUDED.title,
          channel_title = EXCLUDED.channel_title,
          description = EXCLUDED.description,
          published_at = EXCLUDED.published_at,
          thumbnail = EXCLUDED.thumbnail,
          position = EXCLUDED.position,
          duration_ms = EXCLUDED.duration_ms`,
        [
          userId,
          item.videoId,
          item.title,
          item.channelTitle,
          item.description,
          item.publishedAt,
          item.thumbnail,
          item.position,
          item.durationMs,
          item.matchStatus
        ]
      );
    }
  });
}

export async function listYouTubeItems(userId: string) {
  await ensureSchema();
  const result = await pool.query(
    `SELECT
      user_id AS userid,
      video_id AS videoid,
      title,
      channel_title AS channeltitle,
      description,
      published_at AS publishedat,
      thumbnail,
      position,
      duration_ms AS durationms,
      match_status AS matchstatus,
      parsed_artist AS parsedartist,
      parsed_title AS parsedtitle
     FROM youtube_items
     WHERE user_id = $1
     ORDER BY position ASC`,
    [userId]
  );

  return result.rows.map(mapYouTubeRow);
}

export async function insertMatches(
  userId: string,
  videoId: string,
  parsedArtist: string | null,
  parsedTitle: string | null,
  status: MatchStatus,
  matches: SpotifyCandidate[]
) {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM spotify_matches WHERE user_id = $1 AND youtube_video_id = $2", [
      userId,
      videoId
    ]);
    await client.query(
      `UPDATE youtube_items
       SET match_status = $1, parsed_artist = $2, parsed_title = $3
       WHERE user_id = $4 AND video_id = $5`,
      [status, parsedArtist, parsedTitle, userId, videoId]
    );

    for (const match of matches) {
      await client.query(
        `INSERT INTO spotify_matches
          (user_id, youtube_video_id, spotify_track_id, track_name, artist_name, album_name, duration_ms, confidence_score, accepted, reason)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, youtube_video_id, spotify_track_id) DO UPDATE SET
          track_name = EXCLUDED.track_name,
          artist_name = EXCLUDED.artist_name,
          album_name = EXCLUDED.album_name,
          duration_ms = EXCLUDED.duration_ms,
          confidence_score = EXCLUDED.confidence_score,
          accepted = EXCLUDED.accepted,
          reason = EXCLUDED.reason`,
        [
          userId,
          videoId,
          match.spotifyTrackId,
          match.trackName,
          match.artistName,
          match.albumName,
          match.durationMs,
          match.confidenceScore,
          match.accepted,
          match.reason
        ]
      );
    }
  });
}

export async function listReviewItems(userId: string, status?: MatchStatus | "all") {
  await ensureSchema();
  const params: string[] = [userId];
  const where =
    status && status !== "all"
      ? "WHERE user_id = $1 AND match_status = $2"
      : "WHERE user_id = $1";

  if (status && status !== "all") params.push(status);

  const rows = await pool.query<YouTubeItemRow>(
    `SELECT
      user_id AS userid,
      video_id AS videoid,
      title,
      channel_title AS channeltitle,
      description,
      published_at AS publishedat,
      thumbnail,
      position,
      duration_ms AS durationms,
      match_status AS matchstatus,
      parsed_artist AS parsedartist,
      parsed_title AS parsedtitle
     FROM youtube_items
     ${where}
     ORDER BY position ASC`,
    params
  );

  const items: ReviewItem[] = [];
  for (const row of rows.rows) {
    const matches = await pool.query<SpotifyMatchRow>(
      `SELECT
        spotify_track_id AS spotifytrackid,
        track_name AS trackname,
        artist_name AS artistname,
        album_name AS albumname,
        duration_ms AS durationms,
        confidence_score AS confidencescore,
        accepted,
        reason
       FROM spotify_matches
       WHERE user_id = $1 AND youtube_video_id = $2
       ORDER BY confidence_score DESC`,
      [userId, row.videoid]
    );

    items.push({
      ...mapYouTubeRow(row),
      matches: matches.rows.map(mapSpotifyMatchRow)
    });
  }

  return items;
}

export async function acceptMatch(
  userId: string,
  videoId: string,
  spotifyTrackId: string | null
) {
  await withTransaction(async (client) => {
    await client.query(
      "UPDATE spotify_matches SET accepted = FALSE WHERE user_id = $1 AND youtube_video_id = $2",
      [userId, videoId]
    );

    if (spotifyTrackId) {
      await client.query(
        `UPDATE spotify_matches
         SET accepted = TRUE
         WHERE user_id = $1 AND youtube_video_id = $2 AND spotify_track_id = $3`,
        [userId, videoId, spotifyTrackId]
      );
      await client.query(
        "UPDATE youtube_items SET match_status = 'matched' WHERE user_id = $1 AND video_id = $2",
        [userId, videoId]
      );
    } else {
      await client.query(
        "UPDATE youtube_items SET match_status = 'no_match' WHERE user_id = $1 AND video_id = $2",
        [userId, videoId]
      );
    }
  });
}

export async function getAcceptedSpotifyUris(userId: string) {
  await ensureSchema();
  const rows = await pool.query<{ spotifytrackid: string }>(
    `SELECT spotify_track_id AS spotifytrackid
     FROM spotify_matches
     WHERE user_id = $1 AND accepted = TRUE
     GROUP BY spotify_track_id
     ORDER BY MIN(id) ASC`,
    [userId]
  );

  return rows.rows.map((row) => `spotify:track:${row.spotifytrackid}`);
}

export async function recordImport(
  userId: string,
  spotifyPlaylistId: string,
  playlistName: string,
  trackCount: number
) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO imports (user_id, spotify_playlist_id, playlist_name, track_count)
     VALUES ($1, $2, $3, $4)`,
    [userId, spotifyPlaylistId, playlistName, trackCount]
  );
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  await ensureSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapYouTubeRow(row: YouTubeItemRow) {
  return {
    videoId: row.videoid,
    title: row.title,
    channelTitle: row.channeltitle,
    description: row.description,
    publishedAt: row.publishedat,
    thumbnail: row.thumbnail,
    position: row.position,
    durationMs: row.durationms,
    matchStatus: row.matchstatus,
    parsedArtist: row.parsedartist,
    parsedTitle: row.parsedtitle
  };
}

function mapSpotifyMatchRow(row: SpotifyMatchRow) {
  return {
    spotifyTrackId: row.spotifytrackid,
    trackName: row.trackname,
    artistName: row.artistname,
    albumName: row.albumname,
    durationMs: row.durationms,
    confidenceScore: row.confidencescore,
    accepted: row.accepted,
    reason: row.reason
  };
}
