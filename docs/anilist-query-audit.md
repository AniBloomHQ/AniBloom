# AniList query audit — November 14, 2026

The actual generated seasonal, ranked, genre-filtered and upcoming schedule
queries were sent to AniList, with their normal variables. All returned HTTP 200
without GraphQL errors. These are single local observations, not latency targets.

| Query | Returned rows | JSON body size | Response time |
| --- | ---: | ---: | ---: |
| Current seasonal series | 50 | 116,494 bytes | 1,384 ms |
| Top Season | 50 | 123,346 bytes | 1,082 ms |
| Seasonal Action genre | 35 | 78,447 bytes | 1,033 ms |
| Upcoming three-day schedule, first page | 50 | 151,531 bytes | 1,144 ms |

## Correctness

- Seasonal requests use season plus seasonYear, separate series/movie formats,
  `type: ANIME`, and `isAdult: false`. Omitting a release-status filter is deliberate:
  season membership includes finished, releasing and not-yet-released entries.
- Current/previous/upcoming season dates are calculated using Asia/Tokyo.
- Genre filtering occurs upstream before pagination. Regular seasonal rows use
  deterministic ID order. Top Season uses popularity, score and ID as tie-breakers.
- The 50-item page size and maximum allowed skip remain within AniList's
  documented 5,000-entry Page depth. Ranking by popularity is not a quality score.
- Schedules use absolute epoch seconds, bounded three-day windows and a stable
  30-second query bucket. The full catalog rechecks exact timestamps after the
  bucketed fetch. Future and previous windows use their respective time order
  and notYetAired filter. The eight-page cap still allows incomplete busy windows.
- Relation IDs, titles, formats, years and external links are consumed by identity
  verification. Trimming these fields could change matching and is not justified
  solely to make the payload smaller.

## Implemented response-handling repair

An HTTP 200 without the expected `data.Page.media` or
`data.Page.airingSchedules` array previously became an empty result. It could be
cached and look like a genuinely empty catalog. Invalid, null and non-JSON bodies
now fail with `ANILIST_INVALID_RESPONSE`, a retryable error, and are not cached.
Malformed older shared entries are bypassed. A real empty array and an empty
GraphQL `errors` array remain valid. GraphQL error responses are still rejected.

## Optimization findings

An experimental seasonal query adding direct `externalLinks { site url }`
returned identical candidate IDs, but grew from 116,494 to 133,790 bytes (+14.8%)
and supplied zero IMDb/TMDB/TVDB links for the sampled 50 titles. The extra fields
were not added. This is a sample, not proof that such links never occur.

A smaller preview-specific field set could reduce response size further, but it
would create a different query/cache key from the full catalog. Measure total
AniList calls and preview-to-install behavior before trading shared response reuse
for smaller individual payloads. Current evidence places most remaining full-page
latency in provider resolution rather than the approximately one-second AniList call.

The subsequent [preview-query experiment](preview-query-experiment.md) measured
this trade-off locally. It retained the shared query as the default.

References:
- https://github.com/AniList/docs/blob/master/docs/reference/object/page.md
- https://github.com/AniList/docs/blob/master/docs/reference/object/media.md
