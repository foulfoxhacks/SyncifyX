import { NextResponse } from "next/server";
import { z } from "zod";
import { insertMatches, listYouTubeItems } from "@/lib/db";
import {
  buildSpotifySearchQueries,
  parseYouTubeTitle,
  scoreSpotifyMatches,
  statusForMatches
} from "@/lib/matcher";
import { optimizeTrackWithOpenAI } from "@/lib/openai-matcher";
import { searchSpotifyTrackCandidates } from "@/lib/spotify";
import { getUserId } from "@/lib/session";

const bodySchema = z.object({
  videoId: z.string().min(1).optional(),
  limit: z.union([z.number().int().min(1).max(500), z.literal("all")]).default(50),
  useAi: z.boolean().default(false)
});

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    const body = bodySchema.parse(await readJsonBody(request));
    const allItems = await listYouTubeItems(userId);
    const matchableItems = allItems.filter(
      (item) => item.matchStatus === "needs_review" || item.matchStatus === "no_match"
    );
    const items = body.videoId
      ? allItems.filter((item) => item.videoId === body.videoId)
      : body.limit === "all"
        ? matchableItems
        : matchableItems.slice(0, body.limit);
    let searched = 0;

    for (const item of items) {
      const parsed = body.useAi
        ? await optimizeTrackWithOpenAI(item, parseYouTubeTitle(item))
        : parseYouTubeTitle(item);

      if (!parsed.title) {
        await insertMatches(userId, item.videoId, parsed.artist, parsed.title, "skipped", []);
        continue;
      }

      const tracks = await searchSpotifyTrackCandidates(
        userId,
        buildSpotifySearchQueries(item, parsed)
      );
      const matches = scoreSpotifyMatches(item, tracks, parsed);
      const status = statusForMatches(item, parsed, matches);
      await insertMatches(userId, item.videoId, parsed.artist, parsed.title, status, matches);
      searched += 1;
    }

    return NextResponse.json({
      searched,
      remaining: body.videoId
        ? matchableItems.length
        : Math.max(0, matchableItems.length - searched)
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

async function readJsonBody(request: Request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}
