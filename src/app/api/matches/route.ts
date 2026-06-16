import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acceptMatch, listReviewItems } from "@/lib/db";
import { getUserId } from "@/lib/session";
import type { MatchStatus } from "@/lib/types";

const patchSchema = z.object({
  videoId: z.string().min(1),
  spotifyTrackId: z.string().min(1).nullable()
});

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const status = request.nextUrl.searchParams.get("status") as MatchStatus | "all" | null;
    return NextResponse.json(
      { items: await listReviewItems(userId, status ?? "all") },
      {
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not load review queue. Check DATABASE_URL/DATABASE_SSL in Vercel. ${(error as Error).message}`
      },
      {
        status: 500,
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = patchSchema.parse(await request.json());
    await acceptMatch(userId, body.videoId, body.spotifyTrackId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
