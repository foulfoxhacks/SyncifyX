import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/config";
import { consumeOAuthState, getUserId } from "@/lib/session";
import { exchangeSpotifyCode } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = await consumeOAuthState("spotify");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/?error=spotify_oauth_state`);
  }

  try {
    const userId = await getUserId();
    await exchangeSpotifyCode(userId, code);
    return NextResponse.redirect(`${appUrl}/?connected=spotify`);
  } catch (error) {
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent((error as Error).message)}`
    );
  }
}
