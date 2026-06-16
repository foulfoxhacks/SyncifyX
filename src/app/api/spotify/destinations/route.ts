import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { listSpotifyDestinationOptions } from "@/lib/spotify";

export async function GET() {
  try {
    const userId = await getUserId();
    const destinations = await listSpotifyDestinationOptions(userId);
    return NextResponse.json({ destinations });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
