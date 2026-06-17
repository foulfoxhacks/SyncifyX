import { NextResponse } from "next/server";
import { z } from "zod";
import {
  countYouTubeItemsForMatching,
  insertMatches,
  listYouTubeItems,
  listYouTubeItemsForMatching
} from "@/lib/db";
import { ApiError } from "@/lib/http";
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
const serverlessBatchLimit = 1;

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    const body = bodySchema.parse(await readJsonBody(request));
    const limit =
      body.limit === "all"
        ? serverlessBatchLimit
        : Math.min(body.limit, serverlessBatchLimit);
    const allItems = body.videoId ? await listYouTubeItems(userId) : [];
    const totalMatchable = body.videoId ? 0 : await countYouTubeItemsForMatching(userId);
    const matchableItems = body.videoId ? [] : await listYouTubeItemsForMatching(userId, limit);
    const items = body.videoId
      ? allItems.filter((item) => item.videoId === body.videoId)
      : matchableItems;
    let searched = 0;

    for (const item of items) {
      const parsed = body.useAi
        ? await optimizeTrackWithOpenAI(item, parseYouTubeTitle(item))
        : parseYouTubeTitle(item);

      if (!parsed.title) {
        await insertMatches(userId, item.videoId, parsed.artist, parsed.title, "skipped", []);
        searched += 1;
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
      total: body.videoId ? items.length : totalMatchable,
      remaining: body.videoId
        ? 0
        : Math.max(0, totalMatchable - searched)
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status >= 400 && error.status < 600 ? error.status : 400 }
      );
    }

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
