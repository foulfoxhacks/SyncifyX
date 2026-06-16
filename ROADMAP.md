# SyncifyX Roadmap

## Primary Goal

Migrate a user's authenticated YouTube Music liked songs into Spotify with a reviewable, recoverable workflow:

1. Connect Google and Spotify.
2. Choose and fetch a YouTube Music liked source or another authenticated YouTube playlist.
3. Parse and score likely Spotify matches.
4. Let the user review uncertain rows.
5. Save accepted matches to Spotify Liked Songs.

The primary destination is Spotify Liked Songs through Spotify's saved-track library endpoint. Playlist export remains available as an optional mirror.

## Feature Areas

### Source And Destination Selection

- Pull source options from YouTube Music Liked Music and authenticated YouTube playlists.
- Pull destination options from Spotify Liked Songs, new playlists, and existing Spotify playlists.
- Preserve selected source and destination preferences per browser.
- Add clearer warnings when changing source will replace the current review queue.

### Destination Modes

- Save accepted tracks to Spotify Liked Songs with `user-library-modify`.
- Create a new Spotify playlist from accepted matches as an optional mirror.
- Add accepted tracks to an existing Spotify playlist.
- Support both destinations in one import run.
- Add duplicate checks before writing to either destination.

### Matching Quality

- Show why each match was accepted, reviewed, or rejected.
- Add alternate candidate rows with side-by-side duration, artist, album, and score.
- Use AI parse assist only for difficult titles, remixes, covers, and uploads with noisy metadata.
- Add a confidence threshold slider for auto-accept behavior.

### Migration Control

- Add resumable migration sessions.
- Add dry-run mode that estimates matched, review, and no-match counts without writing to Spotify.
- Add import history with destination, playlist URL when present, imported count, skipped count, and timestamp.
- Add CSV export for fetched songs, reviewed matches, and no-match rows.

### User Experience

- Add a guided setup checklist for OAuth, database, and canonical domain checks.
- Add inline diagnostics for redirect URI mismatch, missing scopes, development-mode testers, and database connection problems.
- Add theme presets and save the selected theme per browser.
- Add progress animations for fetch, match, review, and import stages.

### Reliability

- Add server-side migration locks so two imports cannot write the same session at once.
- Add rate-limit aware queues for Spotify search and import calls.
- Add health checks for Google, Spotify, database, and OpenAI settings.
- Add retryable job records for long all-library matching runs on serverless hosts.
