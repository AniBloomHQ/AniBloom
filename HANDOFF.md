# AniBloom development handoff

Verified November 24, 2026, Manila time.

## Current state

AniBloom is a Node.js ESM catalog addon for Nuvio. It serves AniList discovery catalogs and UUID-based profiles with selectable catalogs and anime title language. The next task is to verify on Nuvio TV, then Android, that each client refreshes an installed Redis-backed profile after an edit using the original manifest URL.

- Canonical repository is [AniBloomHQ/AniBloom](https://github.com/AniBloomHQ/AniBloom). The verified application baseline is [`d5f72de`](https://github.com/AniBloomHQ/AniBloom/commit/d5f72de39abdd18f4e3698b2f8d128040fc4ed64), the squash merge of [PR #583](https://github.com/AniBloomHQ/AniBloom/pull/583). [PR #582](https://github.com/AniBloomHQ/AniBloom/pull/582) added saved profiles and catalog previews.
- [`AGENTS.md`](AGENTS.md) records the handoff refresh procedure for future Codex pushes and merges. Recheck Git when starting a new session to see any documentation or application changes after the baseline.
- The Redis pilot was running on this Mac at [Configure](http://localhost:3017/configure) and [Sign in](http://localhost:3017/login). Both returned HTTP 200. Recheck listener and storage before using it in a new session. Keep AniBloom's preview on port 3017.
- Vercel deployment is on hold at the user's request. The [production release workflow was skipped](https://github.com/AniBloomHQ/AniBloom/actions/runs/45299014474) for the merge. The public Vercel manifest last returned HTTP 402 with `DEPLOYMENT_DISABLED`. Current hosted availability is unverified.

## Implementation

| Path | Responsibility |
| --- | --- |
| [`README.md`](README.md) | Installation, saved-profile workflow, and Redis pilot setup |
| [`api/home-selector.js`](api/home-selector.js) | Homepage setup dialog, default manifest action, and catalog cards |
| [`api/addon-profile.js`](api/addon-profile.js) | Create, login, edit, preview, and profile manifest and catalog routes |
| [`lib/addon-profile-store.js`](lib/addon-profile-store.js), [`lib/addon-profile-auth.js`](lib/addon-profile-auth.js) | Upstash and file-backed storage, password hashing, and scoped sessions |
| [`lib/addon-profile-page.js`](lib/addon-profile-page.js), [`assets/addon-profile.js`](assets/addon-profile.js), [`assets/addon-profile.css`](assets/addon-profile.css) | Shared profile wizard, step navigation, install layout, and profile styles |
| [`api/resolver-manifest.js`](api/resolver-manifest.js), [`api/catalog-source.js`](api/catalog-source.js), [`api/catalog-preview.js`](api/catalog-preview.js) | Manifest generation, AniList and ID-matching pipeline, and sample catalogs |
| [`scripts/dev-server.js`](scripts/dev-server.js) | Local preview, Redis pilot, and optional local annotation stylesheet hashes |
| [`vercel.json`](vercel.json), [`sync-version.yml`](.github/workflows/sync-version.yml) | Production routing and gated deployment workflow |

The public `/manifest.json` serves English titles and all nine catalogs. Profile creation and edits use the same four steps for language, catalogs, saving, and installation. Profiles offer English and Japanese. Existing Romaji profiles display English through their original URLs. Catalog previews and reordering are available during setup.

The public profile manifest is `/<UUID>/manifest.json`. Sign in at `/login` using the UUID and password, or open `/<UUID>/configure` and enter its password. Saving requires the password, keeps the UUID and manifest URL, and opens the separate install step. The manifest is shareable. Passwords are hashed, and sign-in uses a scoped session cookie. Normal Upstash profile records have no automatic expiry. The two disposable test profiles received explicit 10-minute cleanup TTLs.

The pilot reuses the existing `anibloom-production` Upstash Redis database on the free plan with eviction disabled. The preview reads and writes its own `anibloom:profile:v1:pilot:` namespace and listens on loopback. File-backed local profiles are in `.cache/addon-profiles`. Direct Nuvio install links use HTTPS. The local HTTP preview supplies the manifest URL for manual testing. The homepage's default install action from localhost points to the public manifest.

The initial catalog optimization and title-matching measurements are recorded in [`docs/empty-cache-catalog-results.md`](docs/empty-cache-catalog-results.md) and [`docs/identity-provider-audit.md`](docs/identity-provider-audit.md).

## Environment

- Node.js 20 or later, npm, and Git.
- Preview variables are `PORT`, `ANIBLOOM_PUBLIC_ORIGIN`, `ANIBLOOM_LOCAL_PROFILE_DIR`, and `ANIBLOOM_LOCAL_CACHE_FILE`.
- Redis pilot credential names are `ANIBLOOM_PROFILE_PILOT_REDIS_REST_URL` and `ANIBLOOM_PROFILE_PILOT_REDIS_REST_TOKEN`. Obtain access through the existing authorized connection if the process needs to be restarted. Hosted Redis uses `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- `ANIBLOOM_DEV_PROFILE_STYLE_HASHES` allows exact Codex annotation stylesheet hashes for the loopback preview. Check the installed desktop app's overlay if annotation is unavailable after a restart or app update.

## Verified checks

- For PR #583, all 622 local tests and desktop and mobile Chrome smoke checks passed. GitHub passed Pull Request CI, Historical Secret Scan, and CodeQL.
- The shared wizard passed desktop and mobile create and edit checks, including keyboard step navigation, draft retention, password validation, and same-URL edits. The install layout was checked at widths down to 320 px.
- The real localhost Upstash pilot passed creation, editing, incorrect-password rejection, and fresh-session sign-in. Direct Redis readback confirmed the saved title style and catalog order.
- The latest refresh rehearsal used a single real Redis-backed profile. The TV sequence retrieved the changed Japanese manifest and the Android sequence retrieved the later English manifest. Both used the identical URL with `Cache-Control: no-store`, and removed catalog routes returned HTTP 404. Redis reported no TTL before the disposable profile's cleanup TTL was applied.

## Pending device validation

1. Confirm the TV is available. The Mac's ADB check found no connected devices or wireless debugging services, and no Android SDK emulator was configured. The user previously could not connect their TV through ADB. The latest request for TV readiness and permission to expose one disposable addon's read endpoints to the private LAN awaits a reply. The current preview remains loopback-only.
2. Start with **Nuvio TV** once a device and a reachable test manifest are available. Install the disposable profile once. Save a visible language and catalog change from localhost, then use **Refresh add-ons**. Verify that the refreshed catalog names and membership appear in Nuvio and that the installation still points to the original manifest URL.
3. Repeat with **Nuvio Android** after the TV check. Install once, make a second visible edit, use the installed add-on's refresh control, and verify the new state without reinstalling. Capture client versions and distinguish manifest fetch results from Home row rendering and client-specific row preferences.

The user approved testing with the existing Redis pilot, TV first and Android second. Real-device behavior remains unverified. LAN access is pending confirmation. Keep Vercel deployment on hold and preserve the current port and profile URLs.

## New session prompt

```text
Read AGENTS.md and HANDOFF.md. Recheck Git status, the canonical AniBloomHQ/AniBloom remote, and the Redis pilot on localhost:3017. Resume on-device testing of one Redis-backed profile in Nuvio TV first, then Android. The server rehearsal already passed. Confirm that saving edits and refreshing each installed client shows the new language and catalogs at the same manifest URL. Confirm device readiness and LAN permission before exposing a disposable test manifest. Keep Vercel deployment on hold.
```
