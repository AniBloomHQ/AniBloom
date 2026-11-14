# Preview-specific AniList query experiment — November 14, 2026

## Decision

Keep the current shared query as the default. The lean candidate substantially
improves a preview viewed on its own, but adds an AniList request when the same
catalog is subsequently requested in Nuvio. The current priority is full-catalog
loading and efficient use of the shared upstream budget. The candidate was tested
in isolated local workers and was not enabled on the localhost server. Temporary
production-module prototype code was removed after the experiment.

## Candidate and method

The seasonal candidate requested 12 rows with IDs, English/Romaji/Native titles,
all three existing cover sizes, format, status, start year and end year. It omitted
synonyms, MAL IDs, genres, origin, precise dates and relationship graphs. Those
fields remain necessary in the full identity-resolution query.

Schedule previews kept 50 raw schedule rows because eligibility filtering and
duplicate episodes can otherwise leave fewer than twelve usable titles. Their
lean media projection also retained `isAdult` for the existing eligibility check.

Each sample used a fresh Node process and empty local caches. Three cold seasonal
preview samples per variant ran in alternating order. Repeat requests ran in the
same process. A separate preview-then-full-catalog scenario measured sharing
within the existing 60-second AniList response-cache lifetime. Movie, ranking and
schedule samples checked coverage and output equivalence. No prepared catalog
was supplied to hide upstream work. Remote data was live; timing is variable.

Payload measurements are decoded AniList JSON response bytes, not compressed
wire-transfer sizes. Total upstream fetch counts exclude loopback HTTP calls and
poster downloads. No query was sent merely to render the homepage.

## Seasonal preview results

| Measurement | Current shared query | Lean preview query |
| --- | ---: | ---: |
| Cold preview median, 3 samples | 1,433 ms | 490 ms |
| Cold preview range | 1,273–1,539 ms | 476–1,023 ms |
| AniList JSON response | 116,494 bytes | 8,049 bytes |
| Browser preview JSON | 2,054 bytes | 2,054 bytes |
| Preview-only AniList requests | 1 | 1 |
| Repeat preview, cached | 2–4 ms | 3–4 ms |

The lean variant reduced median cold preview latency by 65.8% and upstream JSON
size by 93.1%. Browser payload and the twelve displayed title/cover/year records
were identical.

## Preview followed by the full catalog

| Measurement, one sample per variant | Current | Lean |
| --- | ---: | ---: |
| Preview | 1,193 ms | 897 ms |
| Subsequent full catalog | 6,803 ms | 8,704 ms |
| Combined elapsed request time | 7,996 ms | 9,601 ms |
| Total AniList requests | 1 | 2 |
| All upstream requests, including mapping providers | 156 | 157 |
| Total AniList JSON bytes | 116,494 | 124,543 |
| Full catalog titles | 50 | 50 |

The additional AniList request is a consequence of different query/cache keys.
The exact timing difference also includes live provider latency, so it must not
be attributed entirely to that extra request. Standalone Nuvio catalog loads
would remain unchanged; this penalty applies to a preview followed by the same
catalog while the shared response would otherwise still be fresh.

## Additional catalogs

| Catalog, one sample each | Current bytes | Lean bytes | Current ms | Lean ms |
| --- | ---: | ---: | ---: | ---: |
| Current-season movies | 26,117 | 7,529 | 718 | 937 |
| Top Season | 123,346 | 8,203 | 1,255 | 485 |
| Upcoming three-day schedule | 151,531 | 35,274 | 1,321 | 781 |

All samples returned twelve tiles, with identical visible records between the
two variants. Smaller payloads did not always mean faster responses: the movie
sample was slower. These small samples establish the trade-off, not production
latency percentiles or an overall traffic-weighted winner.

A lean query remains a viable future choice if standalone website previews
become the priority. It should not be presented as a reduction in the full
catalog's identity-resolution cost.
