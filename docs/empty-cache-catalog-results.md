# First full catalog with empty storage — November 15, 2026

This local change targets the first full catalog, with no saved provider facts,
verified identities or prepared pages. It adds no dependency or hosted setting.
The optimized dev pipeline enables it; hosted activation remains separate.

## Changes

- Skip a canonical root's IMDb search only when a positive canonical TMDB root
  already determines publication and no strong current IMDb identity requires
  conflict protection. Keep root IMDb lookup when TMDB is missing/invalid or an
  independent current identity needs comparison. Root traversal, title, year,
  format and related-provider checks remain.
- Start Kitsu work for only the rows still unresolved after provider recovery
  and the MAL bridge, overlapping the remaining relation/canonical work. Its
  result is applied at the original final MAL/AniList fallback stage, so it
  cannot replace a later verified provider match.
- Reuse an early Kitsu result only for the same AniList/MAL/fallback preference.
  Failed/empty early results still get the normal late retry; a changed source
  preference reaches the normal resolver. Positive source facts retain the
  existing bounded six-hour cache behavior.
- Support `ANIBLOOM_LOCAL_CACHE_FILE` in the dev CLI for isolated cold tests,
  while retaining `.cache/catalog-cache.json` as the default.

## Empty-cache paired measurements

Three sequential alternating pairs used new Node processes and new empty cache
files for **every** run. No cache seed was loaded. Every build reported zero
verified-identity hits. Both variants fetched one AniList page and rebuilt
Current Season's first 50 entries. Poster downloads/browser rendering are excluded.
The baseline is the source immediately before these changes, including the
previously implemented shared provider caches.

| Sample | Before | After | Fetch attempts before → after |
| --- | ---: | ---: | ---: |
| 1 | 6,168 ms | 5,187 ms | 162 → 141 |
| 2 | 6,820 ms | 5,181 ms | 162 → 141 |
| 3 | 6,605 ms | 7,173 ms | 162 → 141 |
| Median | **6,605 ms** | **5,187 ms** | **162 → 141** |

Observed median elapsed time fell **21.5%**, with **13.0% fewer fetch attempts**.
IMDb calls fell **70 → 49** in every pair: thirteen non-winning root searches
were skipped, eliminating 21 actual fetches after existing process-cache reuse.
Anime Mapper CDN calls remained 73, Kitsu remained one call, and AniList remained
one call. The source checks were not removed to reach those numbers.

All six runs returned the same **50 ordered IDs and identical full metadata**,
including titles, dates and identity evidence. The corrected Girls und Panzer
TVDB specials mapping remained unchanged. This is a current-season live sample,
not verification of every catalog or every episode.

Network latency still matters. In the third optimized run the late wait for
Kitsu was 1,534 ms despite starting it early, and that run was slower than its
baseline. In the first two optimized runs the final Kitsu wait was under 1 ms.
The improvement is not a guarantee that every empty-cache request finishes in
five seconds. Median local CPU was effectively unchanged (1,191 → 1,187 ms), so
these results primarily demonstrate less I/O and less serialized waiting.

## Verification

Regression tests compare published metadata before/after, require canonical IMDb
checks for missing roots and current-identity conflicts, reject early Kitsu
replacement of later provider matches, preserve changed fallback preferences,
retry failed/empty early results, and compare seasonal and rolling fallback
metadata. **607 tests**, desktop/mobile Chrome interaction checks and release
metadata validation passed. A separate first HTTP request to the real local dev
server, with a new isolated cache file, returned 200/50 titles in 6,426 ms; its
repeat took 6 ms. Both retained all baseline IDs and displayed titles.

## Test locally

Use a new, unused cache filename for each genuinely empty run:

```sh
ANIBLOOM_PUBLIC_ORIGIN=http://localhost:3000 \
ANIBLOOM_LOCAL_CACHE_FILE=/tmp/anibloom-empty-demo-1.json npm run dev
```

Open `http://localhost:3000/catalog/series/current_season.json` for the full
catalog, or `http://localhost:3000` for the installation guide and previews.
The homepage preview is a separate discovery path and can warm AniList data,
so request the full catalog first when measuring an entirely cold pipeline.
After that request, ordinary cache reuse is expected. A query string can bypass
an old browser response, but it does not reset the server's cache.

The existing `scripts/benchmark-provider-cache.mjs` supports fresh cache files
and `--root` for an isolated baseline checkout. Use different empty files for
each variant; the saved-cache comparison in
[shared-provider-cache-results.md](shared-provider-cache-results.md) measures a
different scenario.
