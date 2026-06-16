import { getGoogleAccessToken } from "./google";
import { ApiError, fetchJson } from "./http";
import type { YouTubeItem } from "./types";

type YouTubeChannelsResponse = {
  items?: {
    contentDetails?: {
      relatedPlaylists?: {
        likes?: string;
      };
    };
  }[];
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: {
    snippet: {
      title: string;
      description?: string;
      channelTitle?: string;
      publishedAt?: string;
      position: number;
      resourceId?: {
        videoId?: string;
      };
      thumbnails?: {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
      };
    };
    contentDetails?: {
      videoId?: string;
    };
  }[];
};

type VideosResponse = {
  items?: {
    id: string;
    contentDetails?: {
      duration?: string;
    };
  }[];
};

export async function fetchYouTubeMusicLikedItems(userId: string) {
  const token = await getGoogleAccessToken(userId);
  const playlistIds = await getLikedPlaylistIds(token);
  const allowRegularLikesFallback = process.env.YOUTUBE_FALLBACK_TO_REGULAR_LIKES === "true";
  let lastError: unknown;

  for (const playlistId of playlistIds) {
    try {
      const items = await fetchPlaylistItems(token, playlistId);
      return { playlistId, items };
    } catch (error) {
      lastError = error;
      if (!allowRegularLikesFallback) break;
    }
  }

  if (lastError instanceof ApiError) {
    throw new Error(
      `Could not fetch YouTube Music Liked Music playlist. YouTube returned ${lastError.status}: ${lastError.body}`
    );
  }

  throw lastError instanceof Error ? lastError : new Error("Could not fetch YouTube liked music.");
}

async function fetchPlaylistItems(token: string, playlistId: string) {
  const items: YouTubeItem[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50"
    });
    if (pageToken) params.set("pageToken", pageToken);

    const page = await fetchJson<PlaylistItemsResponse>(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    const videoIds =
      page.items
        ?.map((item) => item.contentDetails?.videoId ?? item.snippet.resourceId?.videoId)
        .filter((id): id is string => Boolean(id)) ?? [];
    const durations = await fetchDurations(token, videoIds);

    for (const item of page.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet.resourceId?.videoId;
      if (!videoId) continue;

      items.push({
        videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle ?? "",
        description: item.snippet.description ?? "",
        publishedAt: item.snippet.publishedAt ?? null,
        thumbnail:
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.default?.url ??
          null,
        position: item.snippet.position,
        durationMs: durations.get(videoId) ?? null,
        matchStatus: "needs_review"
      });
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

  return items;
}

async function getLikedPlaylistIds(token: string) {
  const musicLikesId = process.env.YOUTUBE_MUSIC_LIKES_PLAYLIST_ID ?? "LM";
  const response = await fetchJson<YouTubeChannelsResponse>(
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
    {
      headers: { authorization: `Bearer ${token}` }
    }
  );

  const regularYouTubeLikesId = response.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  return [...new Set([musicLikesId, regularYouTubeLikesId].filter(Boolean) as string[])];
}

async function fetchDurations(token: string, videoIds: string[]) {
  const durations = new Map<string, number>();
  if (videoIds.length === 0) return durations;

  const params = new URLSearchParams({
    part: "contentDetails",
    id: videoIds.join(",")
  });

  const response = await fetchJson<VideosResponse>(
    `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
    {
      headers: { authorization: `Bearer ${token}` }
    }
  );

  for (const item of response.items ?? []) {
    const duration = item.contentDetails?.duration;
    if (duration) durations.set(item.id, parseIsoDuration(duration));
  }

  return durations;
}

function parseIsoDuration(duration: string) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
