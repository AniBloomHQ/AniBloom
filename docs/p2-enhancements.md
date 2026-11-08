# Unified catalogs, ranked discovery, and artwork setup

> **Unreleased development state (November 2026).** GitHub source has changes pending review; the last verified Vercel production deployment is v2.15.0. Do not advertise these features as live or deploy without the owner's new explicit authorization. Source version and `ops/release-state.json` are unchanged by this work.

## 1. All 11 catalogs in the default manifest

The canonical `/manifest.json` (and the Romaji and Native variants) advertises **all eleven** catalog IDs in this order: `upcoming_season`, `current_season`, `previous_season`, `upcoming_season_movies`, `current_season_movies`, `previous_season_movies`, `upcoming_3_days`, `previous_3_days`, `airing_today`, `upcoming_7_days`, and `top_season`.

The previous `/extended` and `/ranked` paths, including combined and language-prefixed paths, remain functional **aliases** yielding identical 11-catalog manifests. They should not be installed alongside the canonical manifest because Nuvio may display duplicate addon rows. Old installations may need a manifest refresh or remove/reinstall after a **future actual deployment**.

For visibility control, use Nuvio Web **Settings → Home** (per-catalog show/hide and reorder) or the equivalent **Catalog Customization / Reorder Home Catalogs** on supported Nuvio TV/mobile builds. These settings can affect catalog availability beyond the Home screen on some clients, and a manifest containing additional catalog IDs may cause extra startup requests before users disable rows. Disabling Home rows is **not** a guarantee of zero external requests in all clients. Primary references: [Nuvio Web Home settings](https://orochibraru.com/nuvio-web/docs/profiles-and-settings) and [Nuvio TV catalog controls / platform caveat](https://github.com/NuvioMedia/NuvioTV/issues/3478).

Top Season uses the current Japanese calendar season (`Asia/Tokyo`) and upstream AniList sorting `POPULARITY_DESC, SCORE_DESC, ID`. That is *AniList list popularity*, not editorial quality. It requests exactly one 50-item AniList season page before existing provider-identity processing. Airing Today ends at Japan's next midnight; Upcoming 7 Days covers a rolling 168 hours and retains the existing eight-page schedule query cap. Normalized catalog response keys remain partitioned by catalog ID/season/search/genre. Fetch limits, stale caches, shared AniList budgets, and safety guards remain in place.

## 2. Configure alternative catalog artwork

### Supported install-time variants

Choose **Catalog artwork source** on the AniBloom homepage, or install the matching fixed manifest URL. Nuvio derives catalog endpoints from this manifest prefix, so the artwork source applies to **all catalog responses** even when a client cannot set a custom catalog filter.

| Source | English | Romaji | Native |
| --- | --- | --- | --- |
| AniList default | `/manifest.json` | `/romaji/manifest.json` | `/native/manifest.json` |
| BetterPosters | `/betterposters/manifest.json` | `/romaji/betterposters/manifest.json` | `/native/betterposters/manifest.json` |
| PostersPlus | `/postersplus/manifest.json` | `/romaji/postersplus/manifest.json` | `/native/postersplus/manifest.json` |

These paths use the project's public HTTPS origin (`https://anibloom.vercel.app` for the official deployment) **after a future deployment**. For a self-hosted installation, use that installation's own origin. Manifest languages, identities and catalogs are otherwise identical.

The optional per-catalog Stremio-protocol `artwork` extra (`AniList`, `BetterPosters`, `PostersPlus`) is still supported for clients that actually expose it. When passed explicitly it overrides the artwork implied by the install URL. An invalid value returns HTTP 400 before upstream work. Nuvio compatibility varies by client; the fixed URL is the reliable installation-level option.

### AniList

Default, requires no setup. Catalog covers are taken from the highest-available AniList cover (`extraLarge → large → medium`).

### BetterPosters

1. On the AniBloom homepage choose **BetterPosters** as the artwork source.
2. Copy the generated `/betterposters/manifest.json` (or the selected language equivalent) URL and add it via Nuvio **Settings → Addons**. Remove an old AniBloom variant if Nuvio would otherwise duplicate rows.
3. The catalog response changes the poster to the documented `https://btttr.cc/poster/imdb/poster-default/{imdb_id}.jpg` **only when the final resolved catalog ID is an IMDb ID**. Missing/unsupported identities stay on the original AniList cover. This does not change Nuvio metadata-provider details or wrap other addons.

There is no BetterPosters API key in AniBloom and no server-side image proxy. A separate independent option is the community [BetterPosters Nuvio wrapper](https://github.com/StrayBer/nuvio-better-posters-addon), which can wrap selected installed catalog addons instead; its encoded configuration **is not encrypted**, so never enter private addon manifests.

### PostersPlus

1. Provision a publicly reachable **HTTPS** PostersPlus instance that explicitly permits unauthenticated public poster requests and is approved by its operator for this traffic. [PostersPlus official setup](https://github.com/UmbraProjects/PostersPlus), [anime-native IDs](https://github.com/UmbraProjects/PostersPlus/blob/dev/URL_REFERENCE.md).
2. On the **AniBloom deployment**, set the **non-secret, public origin only** environment variable `POSTERSPLUS_PUBLIC_BASE_URL` to that origin. Example placeholder: `https://posters.example.org`. Do not put a port, path, query, fragment, username/password or secret in the value. This setting is an operator-side deployment configuration, **not** a per-user setting on the public homepage. **Do not change Vercel configuration or deploy as part of this GitHub-only task.**
3. On the homepage choose **PostersPlus** and install the fixed `/postersplus/manifest.json` (or language variant).
4. For a positive AniList ID, AniBloom supplies direct poster URLs such as `https://posters.example.org/poster?anilist_id=11&type=series`. Without a valid ID or without the validated configured host, the unchanged AniList poster is returned.

**Important security limitation:** Many PostersPlus services use an `ACCESS_KEY` in image URLs and need authentication. This integration does **not support** those services because the client must fetch the poster directly and the public catalog response would disclose keys in its URL. Never embed a password, admin key, private token, or server key in a manifest, hostname, public GitHub repo or public image URL. Use a separately secured metadata/image-provider integration instead if you need authentication. The project doesn't operate or guarantee a shared free PostersPlus host.

### Fallback and compatibility

Artwork projection happens **after** cached canonical identity and title data. AniBloom sends **no extra server-side calls** to the poster providers; Nuvio (or the device's image client) fetches the external image directly. Thus artwork choices share the original normalized catalog response cache key and AniList request budget.

If a title lacks the compatible ID or PostersPlus isn't configured, AniBloom emits its original AniList poster. If a returned BetterPosters/PostersPlus URL later fails to load (404, quota, outage), AniBloom cannot detect the failure or replace it after the response: fallback depends on Nuvio or its metadata provider. Detail-page artwork may differ, since AniBloom is catalog-only. Verify actual Nuvio client UI and both provider hosts after an authorized deployment. Do not claim preview/demo compatibility with live Vercel without testing.

## 3. Performance and release policy

Default manifest expansion from eight to eleven IDs is a deliberate product change: it **does not perform all eleven upstream requests merely to render the HTML homepage or manifest**, but Nuvio may request newly advertised rows immediately. This can increase total AniList queries, mapping work, Vercel CPU and error rate, including `ANILIST_RATE_LIMIT_BUDGET`. Turning off unwanted rows may mitigate traffic but is client-dependent. The two rolling schedules still have a bounded eight-page cap, `top_season` one AniList page per request, with existing shared cache and limiter. Artwork variants do not multiply server-side upstream requests.

No new dependencies, cron jobs, production probes, telemetry or paid services. Performance/cost validation comprises offline regression tests of page bounds and cache isolation; **real production CPU savings or Nuvio startup traffic are not measured**. Keep observability #511 deferred; do not reinstate scheduled production monitoring to validate this change. After a user-authorized release, verify default/legacy manifests, per-row client toggles, provider poster requests, and request budgets before revising resource policy.

Version and deployment metadata remain unchanged while development-only changes are merged. Production is last verified at v2.15.0; a new explicit release request is required before any Vercel deployment, independently of Hobby plan quotas.
