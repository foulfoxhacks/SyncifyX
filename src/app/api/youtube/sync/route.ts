import { NextRequest, NextResponse } from "next/server";
import { upsertYouTubeItems } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  fetchYouTubeMusicLikedItems,
  fetchYouTubePlaylistSource
} from "@/lib/youtube";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const sourcePlaylistId = await getSourcePlaylistId(request);
    const { playlistId, items } = sourcePlaylistId
      ? await fetchYouTubePlaylistSource(userId, sourcePlaylistId)
      : await fetchYouTubeMusicLikedItems(userId);
    await upsertYouTubeItems(userId, items);
    return NextResponse.json({ playlistId, count: items.length });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

async function getSourcePlaylistId(request: NextRequest) {
  try {
    const body = (await request.json()) as { sourcePlaylistId?: string };
    return body.sourcePlaylistId?.trim() || null;
  } catch {
    return null;
  }
}
