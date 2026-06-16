import { NextRequest, NextResponse } from "next/server";
import { getAcceptedSpotifyUris, recordImport } from "@/lib/db";
import {
  addTracksToPlaylist,
  createSpotifyPlaylist,
  saveTracksToLibrary
} from "@/lib/spotify";
import { getUserId } from "@/lib/session";

const playlistName = "Imported YouTube Likes";
type ImportDestination = "liked" | "playlist" | "both";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const uris = await getAcceptedSpotifyUris(userId);
    const destination = await getDestination(request);

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

    return NextResponse.json({
      destination,
      playlistId: playlist?.id ?? null,
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

async function getDestination(request: NextRequest): Promise<ImportDestination> {
  try {
    const body = (await request.json()) as { destination?: ImportDestination };
    if (body.destination === "playlist" || body.destination === "both") {
      return body.destination;
    }
  } catch {
    return "liked";
  }

  return "liked";
}
