import type { SpotifyTrack } from "./spotify";
import type { MatchStatus, SpotifyCandidate, YouTubeItem } from "./types";

const noisePatterns = [
  /\[[^\]]+\]/g,
  /\((?:official|music video|audio|lyrics?|visualizer|hd|4k|mv|video|full album)[^)]*\)/gi,
  /\b(?:official|music video|audio|lyrics?|visualizer|hd|4k)\b/gi
];

const musicSignals = [
  "official audio",
  "official video",
  "music video",
  "lyrics",
  "visualizer",
  "topic",
  "vevo",
  "records"
];

const variantWords = ["remix", "live", "cover", "sped up", "nightcore", "slowed"];

export function parseYouTubeTitle(item: Pick<YouTubeItem, "title" | "channelTitle">) {
  const original = item.title.replace(/\s+/g, " ").trim();
  const cleaned = stripNoise(original);
  const dashMatch = cleaned.match(/^(.+?)\s[-–—]\s(.+)$/);

  if (dashMatch) {
    return {
      artist: cleanArtist(dashMatch[1]),
      title: cleanSongTitle(dashMatch[2])
    };
  }

  const topicArtist = item.channelTitle.replace(/\s*-\s*Topic$/i, "").trim();
  if (topicArtist && /topic$/i.test(item.channelTitle)) {
    return {
      artist: topicArtist,
      title: cleanSongTitle(cleaned)
    };
  }

  return {
    artist: null,
    title: cleanSongTitle(cleaned)
  };
}

export function scoreSpotifyMatches(
  item: YouTubeItem,
  tracks: SpotifyTrack[],
  parsed: { artist: string | null; title: string }
): SpotifyCandidate[] {
  return tracks
    .map((track) => {
      const artistName = track.artists.map((artist) => artist.name).join(", ");
      const titleMatch = similarity(normalize(parsed.title), normalize(track.name));
      const artistMatch = parsed.artist
        ? similarity(normalize(parsed.artist), normalize(artistName))
        : channelArtistSignal(item.channelTitle, artistName);
      const durationMatch =
        item.durationMs && track.duration_ms
          ? Math.abs(item.durationMs - track.duration_ms) <= 8_000
          : false;
      const hasMusicSignal = musicSignals.some((signal) =>
        `${item.title} ${item.channelTitle}`.toLowerCase().includes(signal)
      );
      const variantPenalty = hasVariantMismatch(item.title, track.name) ? 30 : 0;

      const confidenceScore = clamp(
        Math.round(
          titleMatch * 40 +
            artistMatch * 30 +
            (durationMatch ? 10 : 0) +
            (hasMusicSignal ? 10 : 0) -
            variantPenalty
        ),
        0,
        100
      );

      return {
        spotifyTrackId: track.id,
        trackName: track.name,
        artistName,
        albumName: track.album.name,
        durationMs: track.duration_ms,
        confidenceScore,
        accepted: false,
        reason: buildReason(titleMatch, artistMatch, durationMatch, hasMusicSignal, variantPenalty)
      };
    })
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .map((match, index) => ({
      ...match,
      accepted: index === 0 && match.confidenceScore >= 78
    }));
}

export function statusForMatches(
  item: YouTubeItem,
  parsed: { artist: string | null; title: string },
  matches: SpotifyCandidate[]
): MatchStatus {
  if (isLikelyUnavailable(item.title)) return "skipped";
  if (!looksLikeMusic(item, parsed)) return "skipped";
  if (matches.length === 0) return "no_match";
  if (matches[0].confidenceScore >= 78) return "matched";
  if (matches[0].confidenceScore >= 45) return "needs_review";
  return "no_match";
}

function stripNoise(title: string) {
  return noisePatterns.reduce((value, pattern) => value.replace(pattern, ""), title).trim();
}

function cleanArtist(artist: string) {
  return artist.replace(/\s+ft\.?.*$/i, "").replace(/\s+feat\.?.*$/i, "").trim();
}

function cleanSongTitle(title: string) {
  return title
    .replace(/\s+ft\.?\s+.+$/i, "")
    .replace(/\s+feat\.?\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const total = new Set([...aTokens, ...bTokens]).size;
  return total === 0 ? 0 : shared / total;
}

function channelArtistSignal(channelTitle: string, artistName: string) {
  const cleanedChannel = normalize(channelTitle.replace(/\s*-\s*topic$/i, ""));
  return similarity(cleanedChannel, normalize(artistName));
}

function hasVariantMismatch(sourceTitle: string, spotifyTitle: string) {
  const source = sourceTitle.toLowerCase();
  const target = spotifyTitle.toLowerCase();
  return variantWords.some((word) => source.includes(word) !== target.includes(word));
}

function looksLikeMusic(item: YouTubeItem, parsed: { artist: string | null; title: string }) {
  if (parsed.artist) return true;
  if (/topic$/i.test(item.channelTitle)) return true;
  return musicSignals.some((signal) =>
    `${item.title} ${item.channelTitle} ${item.description}`.toLowerCase().includes(signal)
  );
}

function isLikelyUnavailable(title: string) {
  return /\b(deleted video|private video|unavailable)\b/i.test(title);
}

function buildReason(
  titleMatch: number,
  artistMatch: number,
  durationMatch: boolean,
  hasMusicSignal: boolean,
  variantPenalty: number
) {
  const parts = [
    `title ${Math.round(titleMatch * 100)}%`,
    `artist ${Math.round(artistMatch * 100)}%`
  ];
  if (durationMatch) parts.push("duration close");
  if (hasMusicSignal) parts.push("music signal");
  if (variantPenalty) parts.push("variant mismatch");
  return parts.join(", ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
