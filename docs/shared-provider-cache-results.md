# Shared provider cache comparison — November 14, 2026

Shared Anime Mapper source records and positive Kitsu external mappings are
implemented locally through the existing bounded cache adapter. Local optimized
mode enables them; hosted activation remains a separate operation.

## What is shared

- Anime Mapper records are keyed by source URL, MAL ID and cache schema, with a
  six-hour absolute expiry. They retain the complete source facts used by direct
  matching, relation protection and canonical-series traversal. MAL identity is
  checked, and only records with a positive AniList identity are shared.
- Kitsu shares only a single unambiguous positive result, keyed separately by
  external site and external ID, for six hours. A cached secondary-source result
  never suppresses a fresh lookup of the preferred source. Empty, ambiguous and
  failed results are not written to shared storage.
- Shared hits retain their original expiry when promoted into process memory.
  Cache outages/corruption fall back to the provider. Matching, format, year,
  franchise and final provider selection still run; these caches are not final
  identity decisions. Existing brief process-local failure/miss behavior remains.

The local backing cache limits storage to 512 entries/8 MiB and 2 MiB per entry.
The benchmark seed was approximately 759 KB across 258 entries, including
existing provider/verified records and the new source facts. No new service,
dependency, credential or deployment is required.

## Paired fresh-process results

These are six **sequential**, alternating fresh Node 26 processes, three before
and three after, each initialized from an identical copy of one persisted cache
snapshot. The before code is the pre-change implementation; it ignores the new
source-cache entries. Both versions reuse the same existing provider and verified
identity records. Every run rebuilds Current Season's 50-title first page by
calling `buildCatalog`; prepared catalog response hits are bypassed.

| Sample | Before | After | Requests before → after |
| --- | ---: | ---: | ---: |
| 1 | 4,690 ms | 3,554 ms | 79 → 48 |
| 2 | 5,620 ms | 3,530 ms | 79 → 48 |
| 3 | 3,538 ms | 2,954 ms | 79 → 48 |
| Median | **4,690 ms** | **3,530 ms** | **79 → 48** |

Median elapsed time fell about **24.7%**, and fetch attempts fell **39.2%**.
Anime Mapper CDN calls were **30 → 0**, and Kitsu calls were **1 → 0** in every
pair. AniList still made one request. The existing verified-identity hit count
was 36 in both variants. Median local process CPU was 491 → 395 ms; this is not
a measurement of Vercel-billed CPU.

All six runs returned the same 50 ordered IDs **and identical full metadata**,
including displayed titles, dates and identity evidence. In particular, the
previously corrected Girls und Panzer entry retained `tvdb:262098` with its
explicit specials mapping; the bad TMDB TV route and broad IMDb parent were not
reintroduced. This comparison does not certify every episode or every catalog.

## First-ever empty storage

Initial live runs with empty storage returned the same 50 records: before
15,991 ms/163 requests and after 7,594 ms/162 requests. These are exploratory
single samples with different provider failures/latency, not a controlled cache
speedup. The earlier baseline had long IMDb/canonical waits, and some subsequent
exploratory runs overlapped. The controlled paired results above are the basis
for the improvement claim.

**These caches do not eliminate the first-ever provider fetches.** Their benefit
is a cold process rebuilding after another process/catalog has populated source
facts. A completely empty cache still performs the upstream work; normal
prepared-page requests use the existing faster page cache.

## Reproduce locally

Run an empty-storage build, then start a new Node process using the same file:

```sh
node scripts/benchmark-provider-cache.mjs --cache /tmp/anibloom-provider-cache.json --report /tmp/anibloom-first.json
node scripts/benchmark-provider-cache.mjs --cache /tmp/anibloom-provider-cache.json --report /tmp/anibloom-restart.json
```

Use a new cache filename for an empty-storage run. For a before/after comparison,
pass `--root /path/to/baseline-checkout`, give both variants separate identical
copies of the same seed file, hold `--date` and `--catalog` constant, and alternate
the order. The script reports per-host requests/failures, elapsed/CPU time,
stage diagnostics and full returned metadata. Seasonal/ranked catalogs are
supported; rolling catalogs are excluded because they use the live clock.
It forbids hosted AniBloom calls.
Poster downloads and browser rendering are excluded.

Regression coverage includes actual fresh Node processes sharing the disk cache,
direct/canonical/related results, movie versus TV rejection, changed AniList/MAL
identity, source isolation, expiry without extension, invalid records, cache
outages, ambiguous Kitsu mappings and preferred-source recovery.

Final local verification passed **601 tests**, desktop/mobile Chrome interaction
checks and release metadata validation. A forced localhost HTTP rebuild took
8,788 ms and retained all 50 baseline IDs; the regular cached response took 4 ms.
The local manifest advertises localhost URLs, and the preview returned twelve
titles. These HTTP samples use the development server's existing cache rather
than the controlled benchmark seed. The documented CLI was also exercised and
returned the same full metadata (3,607 ms/51 attempts in that later live sample).
Live input/failure variation means the paired 48-attempt result is not a fixed
request guarantee.
