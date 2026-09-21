# Steam and IMDb

- `steam`: Steam store featured top sellers (US storefront, Chinese names where available). This is a limited selection, not the full global sales chart. Products are deduplicated; sales totals are not inferred.
- `imdb_movie`: IMDb MOVIEmeter movie top 10 via the third-party Trends API free tier. TV is not included.

Register for a free key at https://trendsapi.ai/trends/imdb-trends and put `TRENDS_API_KEY=your-key` in the local `.env`. The key is never sent to the browser. Live API verification on 2026-09-21 returned 10 movies. Both the documented direct response and the actual `{statusCode, body}` response envelope are supported.

The documented free quota is 100 successful requests per month and the top 10 entries. Successful results are cached for seven days in memory and the existing persisted source cache, including across restarts. The next collection after seven days fetches a new copy; this is not a fixed Monday schedule. A single deployment normally uses about 4-5 successful calls per month; other deployments, region changes, cache deletion, and manual API calls share the account quota.

The live free-tier response states a 24-hour delay. `sourceUpdatedAt` preserves its timestamp when supplied; `capturedAt` records when this app fetched the response. Weekly synchronization is not real-time. Failed refreshes retain old entries through the collector's stale-cache behavior.

The documented feed only guarantees rank and title; links open an IMDb title search rather than inventing title IDs.

When `ACTIVE_PLATFORMS` is configured, append `steam,imdb_movie`. Without this setting all registered sources are enabled. Restart and refresh the snapshot after configuration. These charts are excluded from cross-platform news aggregation and remain selectable for the daily basket.

Run checks: `node --test tests/charts.test.js`.

## Reddit and TikTok

- Reddit defaults to its public Atom feed at `r/popular/hot.rss`. If that feed fails, the default popular listing falls back to `r/all/top.rss?t=day`; the source message records the actual feed. Configured subreddits are not silently replaced. RSS does not include scores, so heat stays null. `REDDIT_SOURCE=direct` and existing proxy modes remain supported with RSS fallback.
- TikTok uses the current Creative Center `POST /CreativeOne/KnowledgeAPI/GetHashtagList` endpoint. The old page now redirects to a client-rendered app and no longer embeds `__NEXT_DATA__`. Live verification returned three public-preview hashtags with real ranks and views. Optional `TIKTOK_COOKIE` carries a user-provided Creative Center login session, and `TIKTOK_CSRF_TOKEN` carries `x-secsdk-csrf-token` only when present in the browser request. Set these in the ignored local `.env`, then restart. Logged-in collection follows pagination, deduplicates hashtags and removes the old 30-row truncation. A failed page or login reduced to preview data retains the previous successful chart. The 50-page safety bound raises an error rather than treating a partial chart as complete. Authenticated live verification succeeded with 100 entries; pagination regression tests use fixtures.
- Both sources throw on failures so the collector retains successful cached data. Historical sample rows are not reused as successful cache entries.
- Network requests use Node first and system curl for transport failures. Credentials are passed to curl via stdin, not command-line arguments. Install dependencies with `npm ci` before running; Atom parsing uses `fast-xml-parser`.

Run source regression checks with `node --test tests/*.test.js`.

Authenticated live verification on 2026-09-21 returned 100 distinct TikTok hashtags across five pages using the user's supplied session. Source ranks are preserved (they need not be consecutive). The cookie is stored only in the ignored local `.env`; session expiration requires replacing it. The API response, not the presence of a cookie alone, determines whether more entries are available.
