export const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const useCanonicalCallbacks = process.env.NODE_ENV === "production";

function callbackUrl(provider: "google" | "spotify") {
  return `${appUrl}/api/auth/${provider}/callback`;
}

export const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirectUri: useCanonicalCallbacks
    ? callbackUrl("google")
    : process.env.GOOGLE_REDIRECT_URI ?? callbackUrl("google"),
  scopes: ["https://www.googleapis.com/auth/youtube.readonly"]
};

export const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
  redirectUri: useCanonicalCallbacks
    ? callbackUrl("spotify")
    : process.env.SPOTIFY_REDIRECT_URI ?? callbackUrl("spotify"),
  scopes: [
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-collaborative",
    "playlist-read-private",
    "user-library-modify",
    "user-read-private"
  ]
};

export function requireEnv(value: string, name: string) {
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local.`);
  }
  return value;
}
