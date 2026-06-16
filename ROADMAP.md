# SyncifyX Roadmap

## Primary Goal

Migrate a user's authenticated YouTube Music liked songs into Spotify with a reviewable, recoverable workflow:

1. Connect Google and Spotify.
2. Fetch YouTube Music liked songs from the authenticated `LM` source.
3. Parse and score likely Spotify matches.
4. Let the user review uncertain rows.
5. Save accepted matches to Spotify Liked Songs.

The primary destination is Spotify Liked Songs through Spotify's saved-track library endpoint. Playlist export remains available as an optional mirror.

## Feature Areas

### Destination Modes

- Save accepted tracks to Spotify Liked Songs with `user-library-modify`.
- Create a new Spotify playlist from accepted matches as an optional mirror.
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
