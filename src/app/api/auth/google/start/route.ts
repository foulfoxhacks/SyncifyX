import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getGoogleAuthUrl } from "@/lib/google";
import { getUserId, setOAuthState } from "@/lib/session";

export async function GET() {
  await getUserId();
  const state = randomBytes(24).toString("hex");
  await setOAuthState("google", state);
  return NextResponse.redirect(getGoogleAuthUrl(state));
}
