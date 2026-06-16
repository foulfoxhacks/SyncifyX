# YouTube Music Likes to Spotify

API-first MVP for migrating YouTube Music liked songs into a Spotify playlist.

The app uses Google OAuth for YouTube Data API access, Spotify OAuth for playlist creation, Postgres persistence, a simple title/artist parser, Spotify track search, confidence scoring, a review UI, and batched playlist imports.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in OAuth and Postgres credentials.

3. In Google Cloud Console, enable the YouTube Data API v3 and add:

```text
http://127.0.0.1:3000/api/auth/google/callback
```

4. In the Spotify Developer Dashboard, add:

```text
http://127.0.0.1:3000/api/auth/spotify/callback
```

5. Start the app:

```bash
npm run dev
```

For OAuth credential creation, GitHub push steps, and Vercel deployment notes, use [DEPLOYMENT.md](./DEPLOYMENT.md).

## Notes

This targets YouTube Music liked-song behavior through the authenticated YouTube Data API playlist data. YouTube Music does not expose a full standalone public API, so the app first asks YouTube for the authenticated user's related liked playlist and falls back to `LM` when needed.

Spotify imports use `playlist-modify-private` and `playlist-modify-public`, create a playlist named `Imported YouTube Likes`, and add accepted tracks in batches of 100 with retry handling for `429` responses.
