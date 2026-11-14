# Fast local catalog pipeline

Start the local instance with its own install URLs:

```sh
ANIBLOOM_PUBLIC_ORIGIN=http://localhost:3000 npm run dev
```

The CLI enables the optimized pipeline. It keeps the existing nine catalogs,
50-item Nuvio page contract, identity validation and title/artwork projection.
No deployment, version change, scheduled polling or new service is required.

## Website preview

`GET /api/catalog-preview?type=series&id=current_season&titleMode=english`
returns at most 12 display-only titles. All nine catalog/type combinations and
English/Romaji/Native title preferences are supported. Preview JSON intentionally
omits playback IDs and is not advertised as a Nuvio catalog resource.

If a prepared catalog page exists, it supplies the preview and enhanced artwork.
Otherwise the handler uses one existing AniList query page, selects twelve titles
and original covers, and skips provider mapping entirely. Schedule previews use
one schedule page and can be a smaller sample than the full rolling catalog.
The UI explains when original covers are shown. Simultaneous requests share one
build, including across title preferences. The total preview build deadline is
eight seconds, with retryable errors instead of successful empty error responses.

## Prepared catalog pages

The local CLI configures a bounded cache: 512 entries, 8 MiB of value data, and a
2 MiB per-entry cap. Reads return copies so identity-protection code cannot mutate
stored entries. Successful prepared pages, verified identity records and compact
provider lookup records persist atomically in `.cache/catalog-cache.json`.
Raw AniList responses and preview samples stay in memory only. `.cache/` is ignored
by Git. The file is intended for one local server process, not shared coordination
between multiple independently writing servers.

Expiry timestamps survive restarts; a restart does not reset freshness. Existing
policies remain: seasonal pages are fresh for one hour, with 24 additional hours
of stale retention; rolling pages are fresh for 30 seconds, with five additional
minutes retained. A stale page is served while one request-triggered refresh runs.
Identical cold builds share a promise even when distributed locking is unavailable.

## Identity reuse

Verified identity records retain the complete validated mapping evidence and
related-provider protection information. Keys include resolver schema version,
AniList/MAL IDs, title variants, format, dates, country and relationship evidence.
Changed evidence produces a miss. Successful records expire after six hours;
unresolved MAL/AniList fallbacks and provisional canonical TMDB roots are not
marked as verified. Final provider
selection and catalog ordering still run with the existing rules.

Individual Fribb, AniBridge and AnimeAPI TSV lookup results are also cached
for the requested titles, rather than persisting entire remote datasets. Positive
results last six hours. A confirmed empty result from a successfully loaded bulk
dataset lasts five minutes. Failed lookups are not cached as empty successes, and
ARM empty responses remain eligible for immediate recovery attempts.

Optimized local builds also share positive Anime Mapper source records across
direct, related and canonical lookups, keyed by source URL and MAL ID. Positive,
unambiguous Kitsu mappings are shared separately by external site and ID. Both
expire after six hours without extending expiry on a cache hit. Source facts are
revalidated by the existing matching pipeline; failures and ambiguous/missing
Kitsu results do not become shared positive identities. See the
[paired provider-cache comparison](shared-provider-cache-results.md) for results
and a reproducible benchmark. First-ever empty storage still needs upstream work.

Changing provider precedence or identity validation requires advancing
`VERIFIED_IDENTITY_SCHEMA` and reviewing the provider lookup schema if necessary.

## Bounded builds

For cold misses of at least ten titles, Fribb, AniBridge and AnimeAPI TSV bulk
reads start together while ARM and verification proceed. Their results are
consumed in the original order, restricted to each stage's still-unresolved
titles. Smaller misses retain conditional reads. A large miss can therefore
start a bulk download that an earlier source ultimately makes unnecessary;
the maximum speculative width is three datasets, with no extra AniList queries.

On runtimes with native Zstandard support, the optimized AniBridge read uses the
official `mappings.json.zst` release asset instead of `mappings.min.json`.
The verified November 14 release decoded to identical values and key order
(78,853 entries), reducing transfer size from 9,349,394 to 1,707,706 bytes.
Decompression is bounded to 32 MiB. Unsupported runtimes (including Node 20),
failed compressed downloads and invalid compressed data use the original JSON.
Provider precedence and title/franchise verification remain unchanged.

The optimized full catalog build shares a 20-second deadline across AniList,
mapping providers, recovery and response-body consumption. Existing shorter
provider timeouts remain effective. Deadline expiry aborts outstanding HTTP work,
prevents publication of a partially completed page, and returns a retryable 503.
A shared build owns this deadline; closing one browser preview does not cancel a
separate catalog build or other callers' shared work.

The first full catalog with no prepared page or mapping records can still be
slow. Reuse improves subsequent requests, new title-language projections, and
restarts; it does not make first-ever upstream work free. Website discovery
previews use their independent lightweight path during that initial period.

The local CLI enables optimization explicitly. Other entry points retain the
previous mapping path unless `ANIBLOOM_OPTIMIZED_CATALOGS=1` is configured. Any
hosted activation or release remains a separate operation.

## Verification

Regression tests cover shared-cache promotion, persistence and expiry, bounded
cache eviction, evidence invalidation, unchanged resolved IDs, provider failures
versus confirmed misses, deadline cancellation/body stalls, preview validation,
language projection, coalescing and rolling eligibility. Existing browser smoke
checks now exercise the lightweight endpoint. Compare real IDs against a baseline
and report cold storage, reusable identity records and prepared-page hits as
separate measurements; local timings do not establish production latency.

See the [November 14 local comparison](local-performance-results.md) for measured
old/new durations and benchmark conditions.
