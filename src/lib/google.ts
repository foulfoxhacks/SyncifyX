import { googleConfig, requireEnv } from "./config";
import { getToken, upsertToken } from "./db";
import { fetchJson } from "./http";

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export function getGoogleAuthUrl(state: string) {
  requireEnv(googleConfig.clientId, "GOOGLE_CLIENT_ID");

  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: googleConfig.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: googleConfig.scopes.join(" "),
    state
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(userId: string, code: string) {
  requireEnv(googleConfig.clientSecret, "GOOGLE_CLIENT_SECRET");

  const body = new URLSearchParams({
    code,
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    redirect_uri: googleConfig.redirectUri,
    grant_type: "authorization_code"
  });

  const token = await fetchJson<GoogleTokenResponse>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    }
  );

  await upsertToken({
    userId,
    provider: "google",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? googleConfig.scopes.join(" "),
    tokenType: token.token_type ?? "Bearer"
  });
}

export async function getGoogleAccessToken(userId: string) {
  const token = await getToken(userId, "google");
  if (!token) throw new Error("Google account is not connected.");
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) return token.accessToken;

  const body = new URLSearchParams({
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    refresh_token: token.refreshToken,
    grant_type: "refresh_token"
  });

  const refreshed = await fetchJson<GoogleTokenResponse>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    }
  );

  await upsertToken({
    userId,
    provider: "google",
    accessToken: refreshed.access_token,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    scope: refreshed.scope ?? token.scope,
    tokenType: refreshed.token_type ?? token.tokenType
  });

  return refreshed.access_token;
}
