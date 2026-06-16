import { spotifyConfig, requireEnv } from "./config";
import { getToken, upsertToken } from "./db";
import { ApiError, chunk, fetchJson } from "./http";
import type { MigrationOption } from "./types";

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  album: { name: string };
  artists: { name: string }[];
};

type SpotifySearchResponse = {
  tracks: {
    items: SpotifyTrack[];
  };
};

type SpotifyMeResponse = {
  id: string;
};

type SpotifyPlaylistResponse = {
  id: string;
  name?: string;
  external_urls?: {
    spotify?: string;
  };
};

type SpotifyPlaylistsResponse = {
  next?: string | null;
  items: {
    id: string;
    name: string;
    owner?: {
      id?: string;
      display_name?: string;
    };
    tracks?: {
      total?: number;
    };
  }[];
};

export function getSpotifyAuthUrl(state: string) {
  requireEnv(spotifyConfig.clientId, "SPOTIFY_CLIENT_ID");

  const params = new URLSearchParams({
    client_id: spotifyConfig.clientId,
    response_type: "code",
    redirect_uri: spotifyConfig.redirectUri,
    scope: spotifyConfig.scopes.join(" "),
    show_dialog: "true",
    state
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeSpotifyCode(userId: string, code: string) {
  const token = await spotifyTokenRequest({
    code,
    redirect_uri: spotifyConfig.redirectUri,
    grant_type: "authorization_code"
  });

  await upsertToken({
    userId,
    provider: "spotify",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope,
    tokenType: token.token_type
  });
}

async function spotifyTokenRequest(params: Record<string, string>) {
  requireEnv(spotifyConfig.clientSecret, "SPOTIFY_CLIENT_SECRET");

  return fetchJson<SpotifyTokenResponse>("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(
        `${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`
      ).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params)
  });
}

export async function getSpotifyAccessToken(userId: string) {
  const token = await getToken(userId, "spotify");
  if (!token) throw new Error("Spotify account is not connected.");
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) return token.accessToken;

  const refreshed = await spotifyTokenRequest({
    refresh_token: token.refreshToken,
    grant_type: "refresh_token"
  });

  await upsertToken({
    userId,
    provider: "spotify",
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    scope: refreshed.scope ?? token.scope,
    tokenType: refreshed.token_type ?? token.tokenType
  });

  return refreshed.access_token;
}

export async function searchSpotifyTracks(
  userId: string,
  title: string,
  artist: string | null
) {
  const token = await getSpotifyAccessToken(userId);
  const query = artist ? `track:"${title}" artist:"${artist}"` : `track:"${title}"`;
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: "5"
  });

  const response = await fetchJson<SpotifySearchResponse>(
    `https://api.spotify.com/v1/search?${params.toString()}`,
    {
      headers: { authorization: `Bearer ${token}` }
    },
    true
  );

  return response.tracks.items;
}

export async function searchSpotifyTrackCandidates(
  userId: string,
  queries: { title: string; artist: string | null }[]
) {
  const seen = new Set<string>();
  const tracks: SpotifyTrack[] = [];

  for (const query of queries) {
    const results = await searchSpotifyTracks(userId, query.title, query.artist);
    for (const track of results) {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }
  }

  return tracks;
}

export async function createSpotifyPlaylist(userId: string, name: string) {
  const token = await getSpotifyAccessToken(userId);
  const me = await fetchJson<SpotifyMeResponse>("https://api.spotify.com/v1/me", {
    headers: { authorization: `Bearer ${token}` }
  });

  try {
    return await fetchJson<SpotifyPlaylistResponse>(
      `https://api.spotify.com/v1/users/${me.id}/playlists`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name,
          public: false,
          description: "Imported from YouTube Music Liked Songs."
        })
      },
      true
    );
  } catch (error) {
    throw enhanceSpotifyForbidden(error, "creating the Spotify playlist");
  }
}

export async function listSpotifyDestinationOptions(userId: string) {
  const token = await getSpotifyAccessToken(userId);
  const options: MigrationOption[] = [
    {
      id: "liked",
      label: "Spotify Liked Songs",
      description: "Save tracks directly into Your Library"
    },
    {
      id: "playlist",
      label: "New private playlist",
      description: "Create Imported YouTube Likes"
    },
    {
      id: "both",
      label: "Liked Songs + new playlist",
      description: "Save to Your Library and create a mirror playlist"
    }
  ];

  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (url) {
    const page: SpotifyPlaylistsResponse = await fetchJson<SpotifyPlaylistsResponse>(
      url,
      {
        headers: { authorization: `Bearer ${token}` }
      },
      true
    );

    for (const playlist of page.items) {
      options.push({
        id: `existing:${playlist.id}`,
        label: playlist.name,
        description: playlist.owner?.display_name
          ? `Existing playlist by ${playlist.owner.display_name}`
          : "Existing Spotify playlist",
        trackCount: playlist.tracks?.total ?? null
      });
    }

    url = page.next ?? null;
  }

  return options;
}

export async function addTracksToPlaylist(
  userId: string,
  playlistId: string,
  uris: string[]
) {
  const token = await getSpotifyAccessToken(userId);
  for (const batch of chunk(uris, 100)) {
    try {
      await fetchJson<{ snapshot_id: string }>(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ uris: batch })
        },
        true
      );
    } catch (error) {
      throw enhanceSpotifyForbidden(error, "adding tracks to the Spotify playlist");
    }
  }
}

export async function saveTracksToLibrary(userId: string, trackIds: string[]) {
  const token = await getSpotifyAccessToken(userId);

  for (const batch of chunk(trackIds, 50)) {
    try {
      await spotifyWrite(
        "https://api.spotify.com/v1/me/tracks",
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ ids: batch })
        },
        true
      );
    } catch (error) {
      throw enhanceSpotifyForbidden(error, "saving tracks to Spotify Liked Songs");
    }
  }
}

async function spotifyWrite(url: string, init: RequestInit, retry429 = false) {
  const response = await fetch(url, init);

  if (response.status === 429 && retry429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, retryAfter) * 1000)
    );
    return spotifyWrite(url, init, false);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(
      `${response.status} ${response.statusText}: ${body}`,
      response.status,
      response.statusText,
      body
    );
  }
}

function enhanceSpotifyForbidden(error: unknown, stage: string) {
  if (error instanceof ApiError && error.status === 403) {
    return new Error(
      `Spotify denied access while ${stage}. Reconnect Spotify from the app so the token includes user-library-modify, playlist-read-private, playlist-read-collaborative, playlist-modify-private, and playlist-modify-public, and make sure your Spotify account is added under the app's User Management while the Spotify app is in development mode. Spotify response: ${error.body}`
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}
