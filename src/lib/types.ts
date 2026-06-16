export type MatchStatus = "matched" | "needs_review" | "no_match" | "skipped";

export type YouTubeItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string | null;
  thumbnail: string | null;
  position: number;
  durationMs: number | null;
  matchStatus: MatchStatus;
};

export type SpotifyCandidate = {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumName: string;
  durationMs: number | null;
  confidenceScore: number;
  accepted: boolean;
  reason: string;
};

export type ReviewItem = YouTubeItem & {
  parsedArtist: string | null;
  parsedTitle: string | null;
  matches: SpotifyCandidate[];
};

export type MigrationOption = {
  id: string;
  label: string;
  description?: string;
  trackCount?: number | null;
};
