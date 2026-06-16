import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSpotifyAuthUrl } from "@/lib/spotify";
import { getUserId, setOAuthState } from "@/lib/session";

export async function GET() {
  await getUserId();
  const state = randomBytes(24).toString("hex");
  await setOAuthState("spotify", state);
  return NextResponse.redirect(getSpotifyAuthUrl(state));
}
