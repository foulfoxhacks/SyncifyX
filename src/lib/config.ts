export const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI ?? `${appUrl}/api/auth/google/callback`,
  scopes: ["https://www.googleapis.com/auth/youtube.readonly"]
};

export const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
  redirectUri:
    process.env.SPOTIFY_REDIRECT_URI ?? `${appUrl}/api/auth/spotify/callback`,
  scopes: [
    "playlist-modify-private",
    "playlist-modify-public",
    "user-read-private"
  ]
};

export function requireEnv(value: string, name: string) {
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local.`);
  }
  return value;
}
