# YouTube Music Likes to Spotify

API-first MVP for migrating YouTube Music liked songs into Spotify Liked Songs.

The app uses Google OAuth for YouTube Data API access, Spotify OAuth for library saves and playlist access, Postgres persistence, a simple title/artist parser, Spotify track search, confidence scoring, a review UI, and batched imports.

Current UI features include selectable YouTube sources, selectable Spotify destinations, theme presets, adjustable batch sizes, all-mode matching, queue sorting, optional AI parse assist, and per-song best-match refresh.

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

For OAuth credential creation, GitHub push steps, and Vercel deployment notes, use [DEPLOYMENT.md](./DEPLOYMENT.md). For release notes, see [CHANGELOG.md](./CHANGELOG.md). For planned migration and matching features, see [ROADMAP.md](./ROADMAP.md).

## Notes

This targets YouTube Music liked-song behavior through authenticated YouTube Data API playlist data. YouTube Music does not expose a full standalone public API, so the app includes the `LM` liked source and can also list the authenticated user's YouTube playlists as selectable sources.

Spotify imports use `user-library-modify` to save accepted tracks directly to Spotify Liked Songs in batches of 50. Optional playlist export uses playlist read/modify scopes to create a playlist named `Imported YouTube Likes` or add to an existing Spotify playlist in batches of 100 with retry handling for `429` responses.
