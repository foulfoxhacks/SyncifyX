import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { listYouTubeSourceOptions } from "@/lib/youtube";

export async function GET() {
  try {
    const userId = await getUserId();
    const sources = await listYouTubeSourceOptions(userId);
    return NextResponse.json({ sources });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
