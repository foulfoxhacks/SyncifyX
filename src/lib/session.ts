import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { ensureUser } from "./db";

const sessionCookie = "ymts_session";
const sessionMaxAge = 60 * 60 * 24 * 365;
const oauthStateMaxAge = 60 * 10;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  };
}

export async function getUserId() {
  const jar = await cookies();
  let userId = jar.get(sessionCookie)?.value;

  if (!userId) {
    userId = randomUUID();
  }

  jar.set(sessionCookie, userId, cookieOptions(sessionMaxAge));
  await ensureUser(userId);
  return userId;
}

export async function setSessionUserId(userId: string) {
  const jar = await cookies();
  jar.set(sessionCookie, userId, cookieOptions(sessionMaxAge));
  await ensureUser(userId);
}

export async function setOAuthState(
  provider: "google" | "spotify",
  state: string,
  userId: string
) {
  const jar = await cookies();
  jar.set(
    `oauth_state_${provider}`,
    JSON.stringify({ state, userId }),
    cookieOptions(oauthStateMaxAge)
  );
}

export async function consumeOAuthState(provider: "google" | "spotify") {
  const jar = await cookies();
  const value = jar.get(`oauth_state_${provider}`)?.value;
  jar.delete(`oauth_state_${provider}`);

  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as { state?: string; userId?: string };
    if (parsed.state && parsed.userId) return parsed;
  } catch {
    return { state: value, userId: jar.get(sessionCookie)?.value ?? null };
  }

  return null;
}
