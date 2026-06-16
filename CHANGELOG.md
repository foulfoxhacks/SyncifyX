# Changelog

## 2026-06-16

### Fixed

- Prevented the app from staying on `checking` forever when account-status or review-queue requests fail.
- Added Postgres connection timeouts and clearer Vercel database error messages.
- Prevented stale cached connection checks after Google or Spotify OAuth redirects.
- Added a production canonical-host redirect so `APP_URL` controls whether the app stays on the Vercel domain or the custom domain.
- Made production Google and Spotify OAuth callbacks derive from `APP_URL` so stale redirect env vars cannot point at the wrong host.
- Added Spotify Liked Songs saving as the primary import destination with the `user-library-modify` scope.
- Added OAuth status retry logic so the connected provider has time to appear before the UI marks it as needed.
- Changed provider pills to show `checking` while account state is loading.
- Hardened client API parsing so serverless text/HTML errors show as readable messages instead of crashing as invalid JSON.

### Changed

- Moved theme, batch, sort, and AI settings into a focused customization drawer.
- Added a sticky top control bar for primary migration actions.
- Changed import copy and controls from playlist-first to Spotify Liked Songs-first, with optional playlist export.
- Batch matching now supports presets, custom values up to 500, and an `all` mode.
- YouTube Music source now targets the `LM` Liked Music playlist and does not silently fall back to regular YouTube liked videos unless explicitly enabled.
- Matching now runs in batches instead of trying to process an entire liked-song library in one serverless request.
- Spotify matching searches multiple candidate query shapes and scores title, artist, duration, music signals, exact matches, and remix/live/cover mismatches.
- Review UI now supports sorting by review priority, confidence score, accepted rows, or original YouTube order.

### Added

- Theme presets, an in-app theme picker, and About/Customization/Migration mode panels.
- Postgres persistence for Vercel/serverless hosting.
- Per-song **Find best match** action.
- Optional OpenAI parse assist through `OPENAI_MATCHING_ENABLED`.
- Red/black SyncifyX visual treatment with motion, feature callouts, and safer responsive controls.
- Deployment runbook for Google OAuth, Spotify OAuth, Vercel, Render Postgres, and production callback URLs.
- Roadmap covering destination modes, matching quality, migration controls, UX diagnostics, and reliability work.

## Initial MVP

### Added

- Next.js and TypeScript app shell.
- Google OAuth for YouTube Data API access.
- Spotify OAuth with playlist modification scopes.
- YouTube liked item fetch, Spotify search, review queue, manual candidate selection, and playlist import.
- Batched Spotify track import with retry handling for rate limits.
