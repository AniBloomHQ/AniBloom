# Local performance comparison — November 14, 2026

These are single sequential local HTTP samples, not production percentiles.
The old implementation was restored from the pre-change local archive into a
temporary directory. Old and new code ran in independent fresh Node workers,
each with its own loopback HTTP server. The new cold case started with an empty
cache file; its restart case reopened the file written by that build.

The catalog was Current Season, series, English titles, first page. Both full
catalog builds returned 50 titles and identical initial ID arrays. Both cases
used the same network environment without Vercel Runtime Cache, Redis, or TMDB
credentials. Remote providers were live, so network latency can vary between
the sequential runs. Poster image downloads and browser rendering are excluded.

| Case | Before | After | Outbound fetch calls, before → after |
| --- | ---: | ---: | ---: |
| First full catalog, empty local caches | 14,060 ms | 11,490 ms | 156 → 156 |
| Repeat full catalog, same process | 646 ms | 9 ms | 29 → 0 |
| New process with saved results | Full rebuild required | 12 ms | New: 0 |
| First website preview | Used full catalog path (14,060 ms sample above) | 1,196 ms | 156 → 1 |
| Repeat website preview | Used full catalog path | 2 ms | New: 0 |

The new website preview returns 12 display-only titles and original covers when
no prepared catalog exists. Its smaller workload is the deliberate optimization;
it does not replace the 50-item Nuvio catalog or claim to verify playback IDs.

Cold full-catalog work still depends on upstream identity verification. Both cold
builds made 156 fetch calls, so the observed cold-time difference should not be
treated as a guaranteed 18% improvement. The repeat and restart paths eliminate
upstream work; the lightweight preview removes identity mapping from first-view
loading altogether. Reused catalog pages retain their published identity array.

Verification at this checkpoint: 560 Node tests passed; desktop/mobile Chrome
interaction smoke passed; real desktop and 390px mobile checks exercised native
titles, twelve preview tiles, Escape-to-close, restored focus and no horizontal
overflow. No hosted deployment or infrastructure change was part of this work.

## Further cold-load improvement

The subsequent change overlaps bulk mapping reads and uses AniBridge's smaller
official compressed asset when native Zstandard is available (local Node 26).
A fresh-process, empty-cache full catalog completed in **6,468 ms**, with 50
titles and 156 fetch calls. The complete ordered ID digest matched the previous
successful cold catalog. Its repeat completed in 6 ms with no outbound calls.
This is approximately 44% below the earlier 11,490 ms sample; live network
conditions vary, so this is not a guaranteed latency reduction. In the latest
paired run, the previous sequential implementation exceeded its 20-second build
deadline and returned 503; that failed run is not used as a successful comparison.

The full compressed mapping dataset was checked for identical values and key
order, and regression tests exercise nonempty compressed results, JSON fallback,
overlap, source precedence, unresolved-row filtering and all existing matching
rules. At this checkpoint 565 Node tests passed.
