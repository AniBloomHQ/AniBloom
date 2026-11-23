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

## Follow-up measurement on November 21, 2026

IMDb searches for rows already holding a non-TMDB identity now run alongside
the remaining mapping fallbacks. Their results still enter the pipeline at the
original IMDb stage. The final ownership retry can reuse an explicit empty
IMDb response from the recovery pass for the same URL on the same page.
Transport errors, malformed responses and later pages still get a fresh lookup.

On pages with at least ten rows, Kitsu starts before secondary lookup when
only one to four rows remain unmatched. A later verified provider match can
still win, and a changed MAL or AniList preference gets its own lookup. This
can issue an early Kitsu request for a title that a later provider resolves.

The baseline in this comparison includes the November 15 optimizations above.
Every sample used a fresh Node process and unused cache file, with zero verified
identity cache hits. Three alternating pairs rebuilt Current Season as of
November 21. Each result contained the same 50 ordered IDs and full metadata.

| Sample | Before | After | Fetch attempts before → after |
| --- | ---: | ---: | ---: |
| 1 | 4,050 ms | 3,432 ms | 155 → 153 |
| 2 | 4,369 ms | 3,301 ms | 155 → 153 |
| 3 | 3,857 ms | 3,280 ms | 155 → 153 |
| Median | **4,050 ms** | **3,301 ms** | **155 → 153** |

The observed median fell 18.5%. IMDb accounted for both saved fetch attempts
(58 → 56). Median time waiting at the main IMDb stage fell from 406 to 168 ms,
and the final Kitsu wait fell from 683 to 318 ms. Kitsu still made three calls.
Anime Mapper used 71 CDN requests per sample, the largest request count. AniList
used one request and took about 1.28 seconds at the optimized median. Five
AnimeAPI requests received HTTP 429 in each paired sample. The comparison
covers the local setup without TMDB credentials. Provider latency varied
substantially during profiling, so these timings are observations for this page.

## Anime Mapper request audit

Anime Mapper still provides direct mappings and canonical series records from
its individual MAL files. Its franchise ownership reads run only when the
existing validator would reject a TVDB or TMDB candidate if that exact ID
belonged to a related title. IMDb ownership from AniList, ARM and Fribb still
applies before canonical resolution. The historical provider fallback retains
its ownership checks. Canonical traversal starts earlier for titles that
always need it due to an explicit parent or prequel.

The baseline includes the November 21 IMDb and Kitsu changes. Each test
started a new Node process with an unused disk cache and zero verified
identity hits. The date and catalog were fixed within alternating pairs.

| Catalog | Samples before → after | Median before → after | Anime Mapper fetches | Total fetches |
| --- | --- | ---: | ---: | ---: |
| Current Season | 3,522 → 3,489 ms / 3,192 → 3,448 ms / 3,220 → 3,393 ms | 3,220 → 3,448 ms | 71 → 65 | 153 → 147 |
| Top Season | 5,813 → 3,368 ms / 2,543 → 2,591 ms | 4,178 → 2,980 ms | 75 → 69 | 124 → 118 |

Every pair saved six fetches and returned identical ordered IDs and full
metadata for all 50 titles. Current Season's median was 228 ms higher, with
more time waiting on Kitsu in these samples. Top Season had only two pairs,
including one slow baseline. The request reduction was repeatable, while a
latency improvement was not established. Regression tests separately cover a
real TVDB collision, an ID that already has ownership evidence, corroborated
current-title evidence and an explicit canonical root.

## Cold identity-stage profile and overlap trial — November 23, 2026

Three fresh-process, empty-cache builds of Current Season page one returned the
same 50 ordered IDs and byte-for-byte identical published metadata. Each made
187 upstream fetches, including one AniList query. Median timings were 3,924 ms
for the full build, 2,667 ms for identity resolution, 682 ms for ARM, and 706
ms for canonical-series resolution. The benchmark now splits the AniList
request into header wait, body read/decompression and JSON parsing; those
measurements showed body transfer, not parsing, was its variable component.

A trial started canonical-series lookups early for every row that was eligible
at that stage, while retaining the existing final eligibility and merge rules.
Across three more fresh empty-cache builds, outputs remained byte-for-byte
identical, but the speculative work added nine Anime Mapper CDN requests on
every run (71 → 80; total fetches 187 → 196). Median full-build time changed
from 3,924 to 4,034 ms, median identity time from 2,667 to 2,791 ms, and median
canonical-stage time from 706 to 862 ms. Provider latency varied, but the
repeatable request increase and absence of a timing improvement made this a
poor tradeoff. The broader prefetch was discarded; early canonical work remains
limited to explicit parent/prequel rows that will reach the canonical stage.

The same audit found that ARM's two calls are distinct batches: 50 current-page
AniList IDs followed by 31 related-title IDs used for provider ownership
protection. Starting the related batch immediately after the first batch was
also tested in five alternating baseline/candidate pairs. It kept the 187 total
request count and exact 50-title metadata, but full-build medians were 3,461 ms
before and 3,455 ms after; identity medians were 2,163 ms and 2,188 ms. There
was no reliable latency improvement, so the earlier start was discarded. The
ARM client deliberately retries successful empty results on later calls; a
request merge that suppresses that retry could hide a transient mapping and was
not retained.

## Verified-identity seed prototype — November 23, 2026

The existing verified-identity records were exported from one cold build,
without provider-mapping or prepared-catalog entries, then loaded into otherwise
empty cache files for fresh processes. The snapshot contained 29 positive,
validated identity records for this 50-title page (47,827 bytes). All entries
were still inside the existing six-hour freshness window. The AniList page was
fetched normally; the current evidence fingerprint and validator still ran, and
the live provider pipeline handled the other 21 rows.

| Measurement | Empty cache, median (3 runs) | Verified seed, median (3 runs) |
| --- | ---: | ---: |
| Full catalog | 3,924 ms | 3,559 ms |
| Identity stage | 2,667 ms | 2,134 ms |
| Verified identity hits | 0 | 29 |
| Upstream fetches | 187 | 121 |

The seed reduced fetches by 35% in every sample. Anime Mapper CDN requests fell
71 → 45 and IMDb requests 74 → 40; AniList remained one request. All three
seeded runs returned the same 50 ordered IDs and byte-for-byte identical full
metadata as the empty-cache runs. The median elapsed difference was 9% in this
small live sample; provider latency varied, so the repeatable request reduction
is stronger evidence than the timing change.

This proves that shipping or preloading recent verified records can reduce cold
provider work while retaining exact row evidence and live fallback for misses.
It is not yet a production-ready offline index: the prototype reuses the local
cache format, and records expire after six hours. Before integrating an index,
choose its refresh/freshness policy. The safest matching-preserving policy is
to keep the six-hour limit and refresh the snapshot at least that often. An
older or schema-mismatched index should be ignored and use live resolution.
The prototype artifact stayed in `/tmp`; no production data or runtime change
was made.

Recommended integration boundary: load only positive verified records, retain
the existing evidence-derived cache key and schema check, and treat expired,
unknown-schema or missing entries as live-resolution misses. Do not include
prepared catalog pages, provider misses or unverified fallbacks in the index.
Keeping a continuously useful six-hour index requires a refresh producer; no
such producer is currently configured. That refresh mechanism and its owner
need agreement before production integration.
