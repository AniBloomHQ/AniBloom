# P2 discovery, artwork and cost safeguards

> **Development status (November 2026):** This implementation is staged on PR #553, not deployed. Production remains v2.15.0 while v2.16.0 is blocked by the Vercel Hobby CPU allowance. Do not imply P2 features are live or update release state.

## Ranked seasonal discovery (explicit opt-in)

- A new `top_season` series catalog uses the **current Japanese anime season** (`Asia/Tokyo`).
- AniList filters by season/year, `isAdult:false`, and `TV/TV_SHORT/ONA/OVA/SPECIAL`. Its upstream sort is `POPULARITY_DESC, SCORE_DESC, ID`, so pagination retains full-upstream popularity ordering; it **does not** rank the first page of the old `current_season` catalog in application memory.
- The ranking represents **AniList list popularity**, not an editorial quality score; `SCORE_DESC` only breaks ties. It is not a guarantee of anime quality.
- The optional ranked manifest is `/ranked/manifest.json` (9 catalogs), with `/extended/ranked/manifest.json` (11 catalogs). English, `/romaji`, and `/native` variants preserve title names and provider identities. The default remains **8** catalogs and the non-ranked extended manifest remains **10**.
- Each page requests exactly one AniList 50-item season-page query before canonical identity handling. Provider mapping can still exclude a record, so a Nuvio page can return fewer than 50 items; we do not overfetch for page fill.
- By design, `top_season` is reachable via ranked routes or `ranked=1` in internal rewrite, not advertised to users who do not opt in.

## Optional poster URLs (per-catalog extras)

The `artwork` catalog extra contains `AniList`, `BetterPosters`, and `PostersPlus`. Omitting the extra (normal installation) leaves AniList's highest-available `extraLarge → large → medium` cover unchanged.

| Selection | Behavior | Fallback |
| --- | --- | --- |
| AniList | Existing AniList poster; no new image endpoint | Existing cover selection logic |
| BetterPosters | `https://btttr.cc/poster/imdb/poster-default/ttNNN.jpg` for a resolved final **IMDb catalog ID** only | Original AniList when the catalog id is not IMDb |
| PostersPlus | `https://<configured-public-host>/poster?anilist_id=NNN&type=series\|movie` for a valid canonical AniList id | Original AniList when no valid id or no validated configured host |

These URLs are directly loaded by the Nuvio client. AniBloom makes **zero new HTTP calls**, does not proxy poster bytes, and never passes credentials/keys to client URLs. The preference is projected on the already-cached normalized catalog results, after identity resolution and title preference. No cache key, request budget or Redis dimension multiplication is needed for artwork choices.

**Operator setup for PostersPlus:** Set the **public non-secret** environment variable `POSTERSPLUS_PUBLIC_BASE_URL` to the bare HTTPS origin of a PostersPlus service that explicitly permits these client requests; e.g. `https://posters.example.org` is a placeholder, not a preconfigured live host. The value must have no username, password, port, path, query or fragment. Never put a service `access_key`, TMDB/MDBList key, private internal hostname or credential into that variable. Providers needing URL credentials are **not supported** by this direct-client integration. There is no default public PostersPlus host or assumption that someone else's instance is free/unlimited.

If an external image URL later returns 404, is rate-limited or offline, AniBloom cannot detect it after delivering catalog JSON; client/metadata-provider image fallback determines what appears. This is intentionally *not* represented as automatic AniList fallback on image load failure. Media detail-page artwork may differ from AniBloom's catalog poster because metadata addons can override it.

**Nuvio compatibility:** The addon advertises an ordinary optional catalog `artwork` extra with enumerated values. Some Nuvio versions may not offer arbitrary extras through their catalog UI. Explicit catalog URLs containing `artwork=BetterPosters` or `artwork=PostersPlus` work at the API level; actual Nuvio UI selection and image behavior remain to be live-tested after deployment.

Primary provider references: [AniList media query and sort](https://github.com/AniList/docs/blob/master/docs/guide/graphql/queries/media.md), [BetterPosters Nuvio proxy's documented direct URL](https://github.com/StrayBer/nuvio-better-posters-addon), [PostersPlus anime-ID direct URL](https://github.com/UmbraProjects/PostersPlus/blob/dev/URL_REFERENCE.md).

## Performance, budget and operational decision

| Work | Unchanged default traffic | Incremental traffic when explicitly opted in |
| --- | --- | --- |
| Top Season | No new catalog query | One extra **AniList GraphQL page per cache miss/page**, plus standard provider identity resolution; cache uses the new catalog id |
| Artwork variants | No additional AniList queries, no server image request | External client-to-provider image fetches; costs/limits belong to image provider; response cache is reused |
| Existing extended airing feeds | Still only opt-in | Existing maximum eight airing schedule pages per request, unchanged by P2 |
| Production monitoring | None added | None added |

No new npm dependencies, background jobs, scheduled health probes or application-level telemetry are introduced. The old 30-minute production availability workflow remains removed.

The test suite includes isolated offline validations of page fan-out, upstream ranking variables, opt-in manifest counts, cache dimension isolation and poster URL/credential validation. **These are budget invariants, not claims of measured production CPU savings.** Exact Vercel CPU, Redis usage, AniList 429 frequency and Nuvio compatibility must be evaluated using existing Vercel/Upstash signals after the quota resets. Prior production errors include `ANILIST_RATE_LIMIT_BUDGET`, so refrain from expanding default catalogs before measuring real use.

P2 observability remains **deferred** under #511 pending justified traffic, cost and privacy analysis. Do not reinstate scheduled production polling or publish user-level request fields. After v2.16.0 is successfully released, measure one representative old page, one ranked page, a cache hit, a stale response and a provider image selection, and compare before enabling additional defaults.
