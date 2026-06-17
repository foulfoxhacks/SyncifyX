import { NextRequest, NextResponse } from "next/server";
import { getAcceptedSpotifyUris, recordImport } from "@/lib/db";
import {
  addTracksToPlaylist,
  createSpotifyPlaylist,
  saveTracksToLibrary
} from "@/lib/spotify";
import { getUserId } from "@/lib/session";

const playlistName = "Imported YouTube Likes";
type ImportDestination = "liked" | "playlist" | "both" | "existing";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const allUris = await getAcceptedSpotifyUris(userId);
    const { destination, playlistId, offset, limit } = await getImportRequest(request);
    const canChunk = destination === "liked";
    const uris = limit && canChunk ? allUris.slice(offset, offset + limit) : allUris;
    const remaining = limit && canChunk ? Math.max(0, allUris.length - offset - uris.length) : 0;
    const nextOffset = limit && canChunk && remaining > 0 ? offset + uris.length : null;

    if (allUris.length === 0) {
      return NextResponse.json(
        { error: "No accepted Spotify tracks are ready to import." },
        { status: 400 }
      );
    }

    if (uris.length === 0) {
      return NextResponse.json({
        destination,
        playlistId: playlistId ?? null,
        url: null,
        count: 0,
        total: allUris.length,
        remaining: 0,
        nextOffset: null
      });
    }

    const trackIds = uris.map((uri) => uri.replace("spotify:track:", ""));
    let playlist: Awaited<ReturnType<typeof createSpotifyPlaylist>> | null = null;

    if (destination === "liked" || destination === "both") {
      await saveTracksToLibrary(userId, trackIds);
      await recordImport(userId, "spotify-liked-songs", "Spotify Liked Songs", uris.length);
    }

    if (destination === "playlist" || destination === "both") {
      playlist = await createSpotifyPlaylist(userId, playlistName);
      await addTracksToPlaylist(userId, playlist.id, uris);
      await recordImport(userId, playlist.id, playlistName, uris.length);
    }

    if (destination === "existing") {
      if (!playlistId) {
        return NextResponse.json(
          { error: "Choose a Spotify playlist before importing to an existing playlist." },
          { status: 400 }
        );
      }
      await addTracksToPlaylist(userId, playlistId, uris);
      await recordImport(userId, playlistId, "Existing Spotify playlist", uris.length);
    }

    return NextResponse.json({
      destination,
      playlistId: playlist?.id ?? playlistId ?? null,
      url: playlist?.external_urls?.spotify ?? null,
      count: uris.length,
      total: allUris.length,
      remaining,
      nextOffset
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

async function getImportRequest(request: NextRequest): Promise<{
  destination: ImportDestination;
  playlistId: string | null;
  offset: number;
  limit: number | null;
}> {
  try {
    const body = (await request.json()) as {
      destination?: ImportDestination;
      destinationId?: string;
      spotifyPlaylistId?: string;
      offset?: number;
      limit?: number;
    };
    const offset = clampNonNegative(body.offset ?? 0);
    const limit = body.limit ? clampLimit(body.limit) : null;

    if (body.destinationId?.startsWith("existing:")) {
      return {
        destination: "existing",
        playlistId: body.destinationId.replace("existing:", ""),
        offset,
        limit
      };
    }

    if (
      body.destinationId === "liked" ||
      body.destinationId === "playlist" ||
      body.destinationId === "both"
    ) {
      return { destination: body.destinationId, playlistId: null, offset, limit };
    }

    if (body.destination === "playlist" || body.destination === "both") {
      return {
        destination: body.destination,
        playlistId: body.spotifyPlaylistId ?? null,
        offset,
        limit
      };
    }

    if (body.destination === "existing" && body.spotifyPlaylistId) {
      return {
        destination: "existing",
        playlistId: body.spotifyPlaylistId,
        offset,
        limit
      };
    }
  } catch {
    return { destination: "liked", playlistId: null, offset: 0, limit: null };
  }

  return { destination: "liked", playlistId: null, offset: 0, limit: null };
}

function clampNonNegative(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function clampLimit(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(500, Math.max(1, Math.floor(value)));
}
