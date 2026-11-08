# Unified catalogs, ranked discovery, and artwork setup

> **Unreleased development state (November 2026).** GitHub source has changes pending review; the last verified Vercel production deployment is v2.15.0. Do not advertise these features as live or deploy without the owner's new explicit authorization. Source version and `ops/release-state.json` are unchanged by this work.

## 1. All nine catalogs in the default manifest

The canonical `/manifest.json` (and the Romaji and Native variants) advertises **all nine** catalog IDs in this order: `upcoming_season`, `current_season`, `previous_season`, `upcoming_season_movies`, `current_season_movies`, `previous_season_movies`, `upcoming_3_days`, `previous_3_days`, and `top_season`.

The previous `/extended` and `/ranked` paths, including combined and language-prefixed paths, remain functional **aliases** yielding identical nine-catalog manifests. They should not be installed alongside the canonical manifest because Nuvio may display duplicate addon rows. The retired same-day and seven-day schedule catalog endpoints now return HTTP 404 across all legacy URL prefixes. Old installations may need a manifest refresh or remove/reinstall after a **future actual deployment**.

For visibility control, use Nuvio Web **Settings → Home** (per-catalog show/hide and reorder) or the equivalent **Catalog Customization / Reorder Home Catalogs** on supported Nuvio TV/mobile builds. These settings can affect catalog availability beyond the Home screen on some clients, and a manifest containing additional catalog IDs may cause extra startup requests before users disable rows. Disabling Home rows is **not** a guarantee of zero external requests in all clients. Primary references: [Nuvio Web Home settings](https://orochibraru.com/nuvio-web/docs/profiles-and-settings) and [Nuvio TV catalog controls / platform caveat](https://github.com/NuvioMedia/NuvioTV/issues/3478).

Top Season uses the current Japanese calendar season (`Asia/Tokyo`) and upstream AniList sorting `POPULARITY_DESC, SCORE_DESC, ID`. That is *AniList list popularity*, not editorial quality. It requests exactly one 50-item AniList season page before existing provider-identity processing. The retained rolling three-day schedule feeds use the existing bounded eight-page schedule query cap. Normalized catalog response keys remain partitioned by catalog ID/season/search/genre. Fetch limits, stale caches, shared AniList budgets, and safety guards remain in place.

## 2. BetterPosters: automatic catalog artwork

**No BetterPosters configuration is required in AniBloom or Nuvio.** The normal canonical manifest is the sole recommended installation path; users only choose their desired *catalog title preference* (English/Romaji/Native).

| Catalog title preference | Canonical manifest | BetterPosters poster text |
| --- | --- | --- |
| English | `/manifest.json` | English (default; no `lang` parameter) |
| Romaji | `/romaji/manifest.json` | English (default; no `lang` parameter) |
| Native | `/native/manifest.json` | Japanese (`?lang=ja`) |

For an eligible IMDb title (`tt` followed by 7–12 digits), AniBloom constructs direct client-side URLs such as `https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg`. Native catalog URLs append `?lang=ja`. AniBloom **does not call the provider or proxy the image**; Nuvio loads it from BetterPosters itself.

We confirmed the provider URL-builder contract against [BetterPosters' published source and unit tests](https://github.com/neurekadev/better-posters/blob/master/BetterPosters/BetterPosterUrlBuilder.cs). Its standard visual options are:

| Option | Default |
| --- | --- |
| Trend tags | On |
| Genre label | On |
| Rating label | On |
| Rating source | Average |
| Quality tags | Off |
| Age-rating tags | Off |
| Language | English for English/Romaji; Japanese for Native |

The URL builder retains the provider's known switch combinations for future code-level use: toggling genre/rating selects `poster`, `poster-r`, `poster-g`, or `poster-n`; quality tags append `q`; age rating appends `a`; disabling trend tags sets `tag=none`; a supported specific rating source uses `rs=...`. These are **not** configurable from the AniBloom homepage. Only the poster language follows the selected manifest language automatically.

### Identity, fallback, and backward compatibility

- Only finalized **IMDb-format catalog IDs** use BetterPosters; other IDs (MAL, AniList, TMDB, etc.) keep their original AniList `extraLarge → large → medium` cover, so cached canonical identities are not altered or guessed.
- A correctly formed BetterPosters URL is **not** guaranteed to resolve to an existing image. If the external service responds with 404, blocks or rate-limits a client, AniBloom cannot substitute the original image after returning its catalog JSON; Nuvio or a separately installed metadata addon controls on-device fallback and detail-page posters.
- Existing explicit provider-specific manifest paths and `artwork` query parameters remain accepted as compatibility interfaces to avoid breaking current installations, but the UI and canonical manifest **do not advertise provider setup or a per-catalog artwork selector**. For new users, no extra configuration is required.
- No credentials, cookies, private addon manifests, API keys, arbitrary custom hostnames or per-user state are supplied to BetterPosters; images are loaded directly by the Nuvio client.

## 3. Performance and release policy

Default manifest expansion from eight to nine IDs is a deliberate product change: it **does not perform all nine upstream requests merely to render the HTML homepage or manifest**, but Nuvio may request newly advertised rows immediately. This can increase total AniList queries, mapping work, Vercel CPU and error rate, including `ANILIST_RATE_LIMIT_BUDGET`. Turning off unwanted rows may mitigate traffic but is client-dependent. The two remaining three-day schedule feeds retain the bounded eight-page cap, `top_season` one AniList page per request, with existing shared cache and limiter. Automatic BetterPosters projection does not add server-side upstream requests.

No new dependencies, cron jobs, production probes, telemetry or paid services. Performance/cost validation comprises offline regression tests of page bounds and cache isolation; **real production CPU savings or Nuvio startup traffic are not measured**. Keep observability #511 deferred; do not reinstate scheduled production monitoring to validate this change. After a user-authorized release, verify default/legacy manifests, per-row client toggles, provider poster requests, and request budgets before revising resource policy.

Version and deployment metadata remain unchanged while development-only changes are merged. Production is last verified at v2.15.0; a new explicit release request is required before any Vercel deployment, independently of Hobby plan quotas.
