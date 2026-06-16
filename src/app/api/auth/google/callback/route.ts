import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google";
import { appUrl } from "@/lib/config";
import { consumeOAuthState, getUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = await consumeOAuthState("google");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/?error=google_oauth_state`);
  }

  try {
    const userId = await getUserId();
    await exchangeGoogleCode(userId, code);
    return NextResponse.redirect(`${appUrl}/?connected=google`);
  } catch (error) {
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent((error as Error).message)}`
    );
  }
}
