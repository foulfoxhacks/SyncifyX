import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { ensureUser } from "./db";

const sessionCookie = "ymts_session";

export async function getUserId() {
  const jar = await cookies();
  let userId = jar.get(sessionCookie)?.value;

  if (!userId) {
    userId = randomUUID();
    jar.set(sessionCookie, userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    });
  }

  await ensureUser(userId);
  return userId;
}

export async function setOAuthState(provider: "google" | "spotify", state: string) {
  const jar = await cookies();
  jar.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });
}

export async function consumeOAuthState(provider: "google" | "spotify") {
  const jar = await cookies();
  const value = jar.get(`oauth_state_${provider}`)?.value;
  jar.delete(`oauth_state_${provider}`);
  return value;
}
