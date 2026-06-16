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
    const uris = await getAcceptedSpotifyUris(userId);
    const { destination, playlistId } = await getImportRequest(request);

    if (uris.length === 0) {
      return NextResponse.json(
        { error: "No accepted Spotify tracks are ready to import." },
        { status: 400 }
      );
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
      count: uris.length
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
}> {
  try {
    const body = (await request.json()) as {
      destination?: ImportDestination;
      destinationId?: string;
      spotifyPlaylistId?: string;
    };

    if (body.destinationId?.startsWith("existing:")) {
      return {
        destination: "existing",
        playlistId: body.destinationId.replace("existing:", "")
      };
    }

    if (
      body.destinationId === "liked" ||
      body.destinationId === "playlist" ||
      body.destinationId === "both"
    ) {
      return { destination: body.destinationId, playlistId: null };
    }

    if (body.destination === "playlist" || body.destination === "both") {
      return { destination: body.destination, playlistId: body.spotifyPlaylistId ?? null };
    }

    if (body.destination === "existing" && body.spotifyPlaylistId) {
      return { destination: "existing", playlistId: body.spotifyPlaylistId };
    }
  } catch {
    return { destination: "liked", playlistId: null };
  }

  return { destination: "liked", playlistId: null };
}
