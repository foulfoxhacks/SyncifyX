import { NextResponse } from "next/server";
import { getAcceptedSpotifyUris, recordImport } from "@/lib/db";
import { addTracksToPlaylist, createSpotifyPlaylist } from "@/lib/spotify";
import { getUserId } from "@/lib/session";

const playlistName = "Imported YouTube Likes";

export async function POST() {
  try {
    const userId = await getUserId();
    const uris = await getAcceptedSpotifyUris(userId);

    if (uris.length === 0) {
      return NextResponse.json(
        { error: "No accepted Spotify tracks are ready to import." },
        { status: 400 }
      );
    }

    const playlist = await createSpotifyPlaylist(userId, playlistName);
    await addTracksToPlaylist(userId, playlist.id, uris);
    await recordImport(userId, playlist.id, playlistName, uris.length);

    return NextResponse.json({
      playlistId: playlist.id,
      url: playlist.external_urls?.spotify ?? null,
      count: uris.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
