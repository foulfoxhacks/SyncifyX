import type { SpotifyTrack } from "./spotify";
import type { MatchStatus, SpotifyCandidate, YouTubeItem } from "./types";

type ParsedTrack = {
  artist: string | null;
  title: string;
};

const noisePatterns = [
  /\[[^\]]+\]/g,
  /\((?:official|music video|audio|lyrics?|visualizer|hd|4k|mv|video|full album|explicit)[^)]*\)/gi,
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

const variantWords = [
  "remix",
  "live",
  "cover",
  "sped up",
  "nightcore",
  "slowed",
  "instrumental"
];

const featuringPattern = /\s+(?:ft\.?|feat\.?|featuring)\s+(.+)$/i;

export function parseYouTubeTitle(item: Pick<YouTubeItem, "title" | "channelTitle">): ParsedTrack {
  const original = item.title.replace(/\s+/g, " ").trim();
  const cleaned = cleanSongTitle(stripNoise(original));
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
      title: cleaned
    };
  }

  return {
    artist: null,
    title: cleaned
  };
}

export function buildSpotifySearchQueries(
  item: Pick<YouTubeItem, "title" | "channelTitle">,
  parsed: ParsedTrack
) {
  const queries: ParsedTrack[] = [];
  const topicArtist = /topic$/i.test(item.channelTitle)
    ? item.channelTitle.replace(/\s*-\s*topic$/i, "").trim()
    : null;

  pushQuery(queries, parsed.title, parsed.artist);
  pushQuery(queries, parsed.title, topicArtist);
  pushQuery(queries, removeVariantWords(parsed.title), parsed.artist);
  pushQuery(queries, removeVariantWords(parsed.title), topicArtist);
  pushQuery(queries, parsed.title, null);

  return queries.slice(0, 5);
}

export function scoreSpotifyMatches(
  item: YouTubeItem,
  tracks: SpotifyTrack[],
  parsed: ParsedTrack
): SpotifyCandidate[] {
  return tracks
    .map((track) => {
      const artistName = track.artists.map((artist) => artist.name).join(", ");
      const normalizedParsedTitle = normalize(removeVariantWords(parsed.title));
      const normalizedTrackTitle = normalize(removeVariantWords(track.name));
      const titleMatch = similarity(normalizedParsedTitle, normalizedTrackTitle);
      const artistMatch = parsed.artist
        ? similarity(normalize(parsed.artist), normalize(artistName))
        : channelArtistSignal(item.channelTitle, artistName);
      const durationDelta =
        item.durationMs && track.duration_ms ? Math.abs(item.durationMs - track.duration_ms) : null;
      const durationMatch = durationDelta !== null && durationDelta <= 8_000;
      const hasMusicSignal = musicSignals.some((signal) =>
        `${item.title} ${item.channelTitle}`.toLowerCase().includes(signal)
      );
      const variantPenalty = hasVariantMismatch(item.title, track.name) ? 30 : 0;
      const exactTitleBonus = normalizedParsedTitle === normalizedTrackTitle ? 8 : 0;
      const exactArtistBonus =
        parsed.artist && normalize(artistName).includes(normalize(parsed.artist)) ? 6 : 0;

      const confidenceScore = clamp(
        Math.round(
          titleMatch * 46 +
            artistMatch * 28 +
            (durationMatch ? 12 : 0) +
            (hasMusicSignal ? 10 : 0) -
            variantPenalty +
            exactTitleBonus +
            exactArtistBonus
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
        reason: buildReason({
          titleMatch,
          artistMatch,
          durationDelta,
          hasMusicSignal,
          variantPenalty,
          exactTitleBonus,
          exactArtistBonus
        })
      };
    })
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .map((match, index) => ({
      ...match,
      accepted: index === 0 && match.confidenceScore >= 82
    }));
}

export function statusForMatches(
  item: YouTubeItem,
  parsed: ParsedTrack,
  matches: SpotifyCandidate[]
): MatchStatus {
  if (isLikelyUnavailable(item.title)) return "skipped";
  if (!looksLikeMusic(item, parsed)) return "skipped";
  if (matches.length === 0) return "no_match";
  if (matches[0].confidenceScore >= 82) return "matched";
  if (matches[0].confidenceScore >= 45) return "needs_review";
  return "no_match";
}

function stripNoise(title: string) {
  return noisePatterns.reduce((value, pattern) => value.replace(pattern, ""), title).trim();
}

function cleanArtist(artist: string) {
  return artist.replace(featuringPattern, "").trim();
}

function cleanSongTitle(title: string) {
  return title
    .replace(featuringPattern, "")
    .replace(/\s+\|\s+.+$/i, "")
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
  if (a.includes(b) || b.includes(a)) return 0.88;

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

function removeVariantWords(title: string) {
  return variantWords
    .reduce(
      (value, word) => value.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi"), ""),
      title
    )
    .replace(/\s+/g, " ")
    .trim();
}

function pushQuery(queries: ParsedTrack[], title: string, artist: string | null) {
  const normalizedTitle = normalize(title);
  const normalizedArtist = artist ? normalize(artist) : "";
  if (!normalizedTitle) return;

  const exists = queries.some(
    (query) =>
      normalize(query.title) === normalizedTitle &&
      normalize(query.artist ?? "") === normalizedArtist
  );
  if (!exists) queries.push({ title, artist });
}

function looksLikeMusic(item: YouTubeItem, parsed: ParsedTrack) {
  if (parsed.artist) return true;
  if (/topic$/i.test(item.channelTitle)) return true;
  return musicSignals.some((signal) =>
    `${item.title} ${item.channelTitle} ${item.description}`.toLowerCase().includes(signal)
  );
}

function isLikelyUnavailable(title: string) {
  return /\b(deleted video|private video|unavailable)\b/i.test(title);
}

function buildReason({
  titleMatch,
  artistMatch,
  durationDelta,
  hasMusicSignal,
  variantPenalty,
  exactTitleBonus,
  exactArtistBonus
}: {
  titleMatch: number;
  artistMatch: number;
  durationDelta: number | null;
  hasMusicSignal: boolean;
  variantPenalty: number;
  exactTitleBonus: number;
  exactArtistBonus: number;
}) {
  const parts = [
    `title ${Math.round(titleMatch * 100)}%`,
    `artist ${Math.round(artistMatch * 100)}%`
  ];
  if (durationDelta !== null) parts.push(`duration ${Math.round(durationDelta / 1000)}s off`);
  if (hasMusicSignal) parts.push("music signal");
  if (variantPenalty) parts.push("variant mismatch");
  if (exactTitleBonus) parts.push("exact title");
  if (exactArtistBonus) parts.push("artist contained");
  return parts.join(", ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
