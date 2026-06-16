import { NextResponse } from "next/server";
import { upsertYouTubeItems } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { fetchYouTubeMusicLikedItems } from "@/lib/youtube";

export async function POST() {
  try {
    const userId = await getUserId();
    const { playlistId, items } = await fetchYouTubeMusicLikedItems(userId);
    await upsertYouTubeItems(userId, items);
    return NextResponse.json({ playlistId, count: items.length });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
