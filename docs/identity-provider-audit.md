# Identity provider audit — November 14, 2026

The current pipeline can be improved incrementally. A complete rewrite is not
recommended: its format, title, year, related-provider ownership, canonical-series
and recovery rules already cover substantial edge cases. Preserve those rules
and measure each change against fixed identity fixtures and live provider data.

## Process reviewed

1. Fetch AniList rows with MAL IDs, title variants, format, dates and relations.
2. Reuse eligible verified identities with an evidence fingerprint; otherwise
   collect ARM, Fribb, external-link and AniBridge candidates.
3. Resolve/verify TMDB where available, including IMDb external IDs and season
   membership; consult AniMap, IDMapper, Anime Mapper and TSV for unresolved rows.
4. Verify IMDb titles and canonical IDs. Run secondary sources, concurrent
   recovery, the MAL bridge and relation fallbacks where still needed.
5. Apply related-provider protection, canonical-series traversal and the targeted
   post-protection retry. Select the provider identity and preserve its evidence.
6. Use the existing Kitsu fallback for remaining MAL/AniList routes, publish a
   complete catalog and cache the normalized result.

Bulk data reads already overlap. The new change overlaps related-provider
ownership reads with IMDb/recovery, after the direct Anime Mapper stage. Their
results are still applied at the original protection stage. An earlier-start
experiment stacked CDN traffic and observed more failed lookups; it was moved
later before keeping the change.

## Correctness findings and local fixes

- **Wrong TMDB namespace:** AniList 188034 was emitted as `type: series`,
  `tmdb:1591447`. The Anime Mapper record explicitly declares `type: Movie` and
  `traktType: movies`. Its TMDB movie page exists; the TV page returns 404.
  The adapter now retains the upstream namespace/type so existing format checks
  reject that TV route. Movie roots also cannot manufacture canonical TV routes.
- **Search label versus canonical metadata:** IMDb search labels can differ from
  the canonical ID lookup. The selected record now retains the canonical title
  and year rather than the earlier search label.
- **Related-title ownership:** an unrelated matching side-story title could
  authorize a parent ID whose own title was incompatible. Shared-related-title
  compatibility now also checks the candidate's own title when supplied.
- **Parent IDs omitted by prefetch:** requests for IDs outside the prefetched
  catalog page previously received no lookup. They now reach the original
  resolver, including when the unrelated page prefetch failed.
- **Failed IMDb responses:** non-success HTTP bodies cannot provide accepted
  suggestions. Only valid empty results are reused within a single resolver
  invocation; a later recovery invocation can retry, and transport/invalid-body
  failures do not become cached misses.
- **Redundant relation work:** recompute unresolved rows after the MAL bridge,
  avoiding relation title searches for titles that bridge has already resolved.
- **Test isolation:** the Bleach canonical-provider fixture now supplies its
  canonical-root dependency instead of relying on a live dataset. Before this
  correction it passed online and failed with network access restricted.

Verified-identity schema 3 and normalized catalog schema 4 prevent earlier
prepared results from bypassing the corrected validation. AniList query and
rate-limit namespaces are unchanged.

## Live sample and practical limits

The initial fresh Current Season build returned 50 distinct IDs: 39 TMDB,
8 IMDb, 2 TVDB and 1 Kitsu. Public checks found 38 valid TMDB TV pages and the
one movie/TV mismatch. All eight IMDb canonical lookups returned compatible
series names and 2026 dates. Both original TVDB routes resolved to the expected
named series, and Kitsu 48879 identified Ninja Skooler.

After the fixes, the same 50 AniList entries retain their order and display
metadata. Forty-nine provider IDs are unchanged. AniList 188034 now uses
`tvdb:262098`, from AniBridge's explicit season-zero mapping, instead of the bad
TMDB TV route. The TVDB specials page contains the named installment's episodes.
The broad IMDb parent route `tt2294076` is rejected. There are no duplicate IDs.

Relevant public evidence:

- [Anime Mapper record, MAL 61227](https://raw.githubusercontent.com/subhajeetch-fl/anime-mapper/main/data/anime/061/61227.json)
- [TMDB movie 1591447](https://www.themoviedb.org/movie/1591447)
- [IMDb canonical metadata for the parent ID](https://v3.sg.media-imdb.com/suggestion/x/tt2294076.json)
- [TVDB mapped specials](https://thetvdb.com/series/girls-und-panzer/seasons/official/0)
- [TMDB series external-ID API](https://developer.themoviedb.org/reference/tv-series-external-ids)

This verifies a 50-title live sample and the regression fixtures, not every
catalog, every episode offset or playback availability. No TMDB API credential
was configured locally, so authenticated TMDB matching and season API behavior
were covered by fixtures rather than a live authenticated run. A successful
provider page alone does not establish episode-level correctness.

## Timing and requests

Independent fresh Node processes, empty local caches, Current Season first page,
50 titles; wall time excludes poster downloads and browser rendering:

| Measurement | Before audit fixes | Final local implementation |
| --- | ---: | ---: |
| Full catalog | 9,576 ms | 7,295 ms |
| AniList stage | 1,213 ms | 1,314 ms |
| Identity stage | 8,351 ms | 5,964 ms |
| Wait at related-protection stage | 854 ms | 3 ms |
| Total outbound fetch attempts | 156 | 162 |
| IMDb fetch attempts | 64 | 70 |
| Anime Mapper CDN fetch attempts | 73 | 73 |
| AniList requests | 1 | 1 |

The observed full duration is about 24% lower. These are live-network samples,
not a controlled latency guarantee; ARM and Kitsu latency also varied. Related
ownership work now happens earlier, so its reduced final-stage wait does not
mean those requests disappeared. Rejecting the bad mapping causes additional
IMDb verification. This change does **not** demonstrate fewer total requests.

The restarted persistent localhost server was also exercised through HTTP:
homepage and manifest returned 200, the twelve-tile preview took 1,398 ms,
the first full request took 11,983 ms, and its repeat took 12 ms. The corrected
TVDB route was present in both full responses. This slower first HTTP sample
shows that cold latency remains variable; the 7,295 ms profiler sample is not
a promise of a consistently faster user-facing cold load.

## Next optimizations

**Next priority, deferred until after the current changes are merged:** implement
shared Anime Mapper caching and positive Kitsu caching locally. Compare fresh
process cold-load durations and total/per-provider request counts against this
checkpoint, and check ordered IDs, title/format/year/franchise evidence and
episode mapping regressions before retaining the changes. Neither cache is
implemented by this checkpoint. Discuss any proposed complete overhaul with the
owner before implementation.

1. Share bounded, positive Anime Mapper record lookups across cold workers and
   related catalogs using the existing cache adapter. Key by source/version and
   MAL ID, retain provider type and source metadata, and keep failures separate
   from successful no-matches. This targets the largest request group: 73 CDN
   fetches in the audited build. Measure request counts and identity changes.
2. Persist positive Kitsu mappings and evaluate overlapping only the remaining
   unresolved titles with late identity checks. The single final fallback added
   1.12 seconds in the final sample. Its result must remain a late fallback and
   must never displace a subsequently verified provider identity.
3. Add fixtures for multiple installments converging on one canonical provider
   root, and document seasonal versus rolling deduplication expectations before
   simplifying the two publication branches. Their current paths differ.
4. Repeat cold-build benchmarks across seasonal, movie and rolling catalogs,
   with provider error counts and a fixed expected identity set. Avoid raising
   concurrency or removing independent checks merely to improve one timing.

An offline compiled identity index could eventually remove most live waterfall
requests, but that would introduce refresh ownership, source-versioning,
conflict-resolution and freshness tradeoffs. Explain and agree on that design
before implementing it; the current local fixes do not require it.

Validation: **582 tests passed** with `npm test`, including new regressions for
wrong provider types, canonical metadata, unrelated side-story authorization,
parent IDs outside a prefetched page, transient failures, overlap and redundant
post-bridge lookups. Desktop/mobile Chrome interaction smoke passed. After a
second restart with `ANIBLOOM_PUBLIC_ORIGIN=http://localhost:3000`, the manifest
advertised local URLs and the persisted corrected 50-title catalog returned 200
in 5 ms. No deployment or hosted configuration was changed.
