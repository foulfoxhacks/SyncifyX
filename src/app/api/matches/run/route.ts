import { NextResponse } from "next/server";
import { insertMatches, listYouTubeItems } from "@/lib/db";
import { parseYouTubeTitle, scoreSpotifyMatches, statusForMatches } from "@/lib/matcher";
import { searchSpotifyTracks } from "@/lib/spotify";
import { getUserId } from "@/lib/session";

export async function POST() {
  try {
    const userId = await getUserId();
    const items = await listYouTubeItems(userId);
    let searched = 0;

    for (const item of items) {
      const parsed = parseYouTubeTitle(item);
      if (!parsed.title) {
        await insertMatches(userId, item.videoId, parsed.artist, parsed.title, "skipped", []);
        continue;
      }

      const tracks = await searchSpotifyTracks(userId, parsed.title, parsed.artist);
      const matches = scoreSpotifyMatches(item, tracks, parsed);
      const status = statusForMatches(item, parsed, matches);
      await insertMatches(userId, item.videoId, parsed.artist, parsed.title, status, matches);
      searched += 1;
    }

    return NextResponse.json({ searched });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
