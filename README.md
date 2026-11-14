# AniBloom — Anime Discovery for Nuvio

<p align="center">
  <img src="assets/anibloom-icon.png" alt="AniBloom logo" width="128" />
</p>

[![Nuvio](https://img.shields.io/badge/Nuvio-addon-ff6f61.svg)](https://nuvio.tv)
[![Vercel](https://img.shields.io/badge/deployed_on-Vercel-black.svg?logo=vercel)](https://vercel.com)
[![Version](https://img.shields.io/badge/version-2.16.1-blue.svg)](https://github.com/AniBloomHQ/AniBloom/releases)

> Where anime blooms.

**AniBloom is a catalog-only addon for Nuvio.** It advertises all **nine supported catalogs** through one default manifest, including seasonal anime and movies, episode schedules, and popularity-ranked discovery. Choose which rows to display using your Nuvio catalog controls. This is development code: production remains on the last deployed version until a separately authorized release.

[Install AniBloom](https://anibloom.vercel.app/manifest.json) · [Homepage](https://anibloom.vercel.app/) · [Support the addon](https://buymeacoffee.com/mark475) · [Releases](https://github.com/AniBloomHQ/AniBloom/releases)

## What AniBloom is

AniBloom advertises these nine catalogs through one manifest:

- **Upcoming 3 days** — Anime with new episodes airing in the next 3 days.
- **Previous 3 days** — Anime that aired in the last 3 days.
- **Current Season** — Anime in the current season.
- **Current Season Movies** — Movies from the current season.
- **Previous Season** — Anime from the recently ended season.
- **Previous Season Movies** — Movies from the recently ended season.
- **Upcoming Season** — Anime from the next upcoming season.
- **Upcoming Season Movies** — Movies from the next upcoming season.

One additional ranked catalog is included in the **original** manifest:

- **Top Anime of the Season** — Popular current-season anime using upstream popularity ordering.

**Finding Top Anime in Nuvio:** This is the **ninth catalog** in the manifest. Some Nuvio versions display only the first eight Home rows initially, so an installed addon can be working correctly even if Top Anime is not immediately visible. In Nuvio Web, open **Settings → Home** to enable or reorder the Top Anime row; on supported TV/mobile builds, look for Catalog Customization. Do not install a separate ranked/extended manifest: those are compatibility aliases of the same nine catalogs.

**Manage your Home rows in Nuvio:** In supported Nuvio Web clients, go to **Settings → Home** to show, hide, and reorder catalog rows. On supported TV/mobile clients, look for **Catalog Customization** or **Reorder Home Catalogs**. The exact menu may vary by platform/version; disabling a catalog on some clients may also make it unavailable to collections. Installing all nine catalogs may increase initial requests until unwanted rows are disabled, particularly for the ranked feed. AniBloom itself does not auto-fetch all nine from the homepage. [Nuvio Web settings documentation](https://orochibraru.com/nuvio-web/docs/profiles-and-settings).

Existing `/extended` and `/ranked` manifest URLs remain supported as compatibility aliases and now return the same nine catalogs. Old installations may cache the two retired schedule rows. Refresh or remove/reinstall AniBloom after a future deployment. The former same-day and seven-day catalog URLs now return HTTP 404; no hidden endpoints remain.

## What AniBloom is not

AniBloom is not a streaming service, media host, or metadata provider. It does not host, store, stream, or distribute anime. It also does not provide detailed metadata such as descriptions, artwork, or episode information.

Install a separate compatible metadata provider in Nuvio to supply detailed title information and artwork. Examples include **ioametadata**, **Xperience**, and **BingeCat**.

### P1 discovery options

The six seasonal series/movie catalogs advertise a fixed selection of optional genres. When supported by the Nuvio client, selecting a genre filters AniList results before pagination; direct catalog requests can also include `genre=Action`. Unfiltered catalogs behave as before. Title searches support English, Romaji, Native and AniList synonym titles, including common accents and punctuation variations. AniList still controls the upstream search candidate set.

**Resource considerations:** The default manifest now advertises all nine catalogs. A disabled Home row typically avoids its regular Home requests in supported clients, but that behavior is client-specific and does not prevent an initial fetch or usage elsewhere. The retained rolling three-day schedule feeds are bounded to eight AniList schedule pages, so busy periods may be incomplete. The ranked catalog uses one upstream page per request before identity resolution. We have **not measured** the increased live Vercel CPU or AniList request volume for this default change.

### BetterPosters catalog artwork (automatic; pending deployment)

**BetterPosters is the default** for catalog titles with a resolved compatible poster ID; no setup, account, password, extra addon, or artwork dropdown is needed. The ordinary `/manifest.json` installation and its Romaji/Native language variants use this behavior:

- **English** (`/manifest.json`) and **Romaji** (`/romaji/manifest.json`) request English poster text.
- **Native** (`/native/manifest.json`) requests Japanese poster text (`lang=ja`). Native catalog titles can be in their original writing system; the poster language is deliberately Japanese.
- Titles without a compatible poster ID keep their original high-resolution AniList cover. Catalog artwork is separate from metadata-provider details. If a BetterPosters image URL fails later, recovery depends on the Nuvio client; AniBloom cannot verify the remote image without extra server traffic.

The visual options follow the BetterPosters defaults: trend tags **on**, genre **on**, rating **on** (average source), quality tags **off**, and age-rating tags **off**. More URL variants are supported internally but not exposed as public install configuration. Images are fetched directly by Nuvio, without a Vercel image proxy or new server-side API calls.

Existing historical poster-provider manifest paths and explicit catalog artwork parameters remain accepted for old installations, but new installs only need the normal manifests. [BetterPosters behavior and limitations](docs/p2-enhancements.md).

## Installation

1. Open the AniBloom [homepage](https://anibloom.vercel.app/).
2. Select **Add to Nuvio**, or copy the manifest URL below into Nuvio.

```text
https://anibloom.vercel.app/manifest.json
```

For manual installation, use the same manifest URL.

### Guided setup and website previews (development)

The homepage's **installation guide** offers Web, Mobile and TV steps, a
**Copy manifest URL** button, and a QR code for the selected English/Romaji/Native
manifest. The QR code is generated locally in the browser, without an external
QR service. If clipboard access is denied, the page selects the URL for manual
copying. The guide also explains duplicate installations, metadata providers,
and how to enable the ninth Top Anime row.

Select any catalog card to open a poster-and-title preview. A preview uses a
prepared catalog when available; otherwise it requests one AniList discovery
page and skips provider-ID mapping. It displays up to 12 titles and reuses successful
responses in the current page for 60 seconds, separately for each title language.
There is no catalog prefetch, pagination, polling, or automatic retry. Closing
the dialog cancels an unfinished request; temporary errors offer a manual retry
that respects `Retry-After`. External posters load directly in the browser;
failed or invalid images show a placeholder. Discovery previews use original
AniList covers, so enhanced artwork in Nuvio can differ. Without JavaScript or dialog
support, catalog links retain their original JSON destination.

These homepage changes are available in local source until separately released.
For a local instance whose manifests should also point locally, run:

```bash
ANIBLOOM_PUBLIC_ORIGIN=http://localhost:3000 npm run dev
```

Open `http://localhost:3000`. A localhost manifest or QR link works only on the
same computer. For another device, configure a reachable LAN or HTTPS origin as
described below; local HTTP installation depends on the Nuvio client.

The local server also enables prepared-page persistence, verified identity reuse,
compact provider lookup caching, and bounded catalog builds. See the
[fast local catalog pipeline](docs/fast-local-catalogs.md) for behavior and limits.
The [identity provider audit](docs/identity-provider-audit.md) records the latest
matching fixes, live correctness checks, timings and remaining optimization work.
The [shared provider cache comparison](docs/shared-provider-cache-results.md)
measures fresh-process rebuilds with the new Anime Mapper and positive Kitsu
caches. The [workflow cost audit](docs/workflow-cost-audit.md) identifies which
manual checks contact the hosted addon and how to reduce those requests.

### Anime title preferences and existing installations

English titles fall back to Romaji, then Native; Romaji titles fall back to English, then Native; Native titles fall back to Romaji, then English. Native means the original writing system (not always Japanese). Title preference is selected through fixed, stateless URL variants; BetterPosters artwork is automatic without accounts or user tokens.

Every variant uses the same nine catalog IDs, types, page size and optional filters. Already-installed legacy `/extended`, `/ranked`, and `/extended/ranked` URLs continue resolving with all nine catalog entries; new installations should use the standard manifest URL. When switching an existing installation, remove the old variant if Nuvio would otherwise display duplicate catalog rows. A new source version alone does not update the *deployed* manifest; Nuvio may also cache a previously installed manifest. Nuvio's metadata providers can override displayed titles or posters on detail pages.

## Self-hosting

You can run your own AniBloom instance instead of using the public deployment. The project supports local development with its included Node.js preview server and deployment to your own Vercel project.

### Requirements

- Node.js 20 or newer
- npm
- Git

### Option 1: Run locally

1. Clone the repository and enter the project directory:

   ```bash
   git clone https://github.com/AniBloomHQ/AniBloom.git
   cd AniBloom
   ```

2. Install the project dependencies:

   ```bash
   npm install
   ```

3. Start the local server:

   ```bash
   npm run dev
   ```

   The server listens on port `3000` by default. Open [http://localhost:3000](http://localhost:3000) to view the homepage.

   To use a different port, set the `PORT` environment variable before starting the server. For example:

   ```bash
   PORT=8080 npm run dev
   ```

4. Use your local manifest URL in Nuvio:

   ```text
   http://localhost:3000/manifest.json
   ```

   If Nuvio runs on a different device, `localhost` refers to that device—not the computer hosting AniBloom. In that case, use the host computer's reachable LAN address and ensure its firewall allows the chosen port. Only expose the server to networks you trust.

**Public origin for self-hosting:** The official public URLs remain the default. To advertise your own HTTPS domain consistently in the manifest logo, catalog cards, and Nuvio install links, configure the **non-secret** environment variable `ANIBLOOM_PUBLIC_ORIGIN` to the origin only (e.g. `https://anime.example.org`). Do not include a path, credentials, query, fragment or private token. Invalid values are rejected at startup rather than silently generating incorrect or unsafe links. Local development may use private HTTP addresses such as `http://localhost:3000` or `http://192.168.1.12:3000` only outside Vercel/production; public deployments require HTTPS. The request `Host` header is never used to choose the advertised origin. If using a local HTTP address, Nuvio's remote-device/HTTPS restrictions may require manual installation or a proper HTTPS reverse proxy. See [P1 validation and self-hosting guidance](docs/p1-validation.md).

The local preview server implements the homepage, manifest, version, catalog, and static asset routes. It is intended for local use and development; use the Vercel deployment option below for a public, serverless instance.

### Option 2: Deploy to your own Vercel project

1. Create or sign in to a [Vercel account](https://vercel.com/signup).
2. Install the Vercel CLI:

   ```bash
   npm install --global vercel
   ```

3. Clone the repository if you have not already, then open its directory:

   ```bash
   git clone https://github.com/AniBloomHQ/AniBloom.git
   cd AniBloom
   ```

4. Link the local project to a new Vercel project and follow the prompts:

   ```bash
   vercel link
   ```

   Choose or create the Vercel project you want to use. Keep the project root directory set to the repository root. AniBloom uses the included `vercel.json` rewrites and `api/` serverless functions; do not set a separate output directory.

5. Deploy a preview to verify the setup:

   ```bash
   vercel
   ```

6. When the preview works, deploy to production:

   ```bash
   vercel --prod
   ```

7. Copy your deployment's manifest URL into Nuvio:

   ```text
   https://YOUR-VERCEL-DOMAIN/manifest.json
   ```

   Replace `YOUR-VERCEL-DOMAIN` with the domain assigned to your Vercel project or a custom domain you have configured.

### Optional environment variable

Set `DONATION_URL` in your Vercel project's environment variables to configure the homepage's **Support development** link. The value must be an HTTPS URL. If it is missing or invalid, the homepage falls back to `https://buymeacoffee.com/mark475`. Configure the variable separately for each environment where you want a custom destination.

Vercel may ask you to confirm project settings during the first deployment. Use the repository root, Node.js 20 or newer, and no custom build or output directory unless Vercel's current project setup specifically requires otherwise. Review your own Vercel plan's function, bandwidth, and usage limits; those limits and any associated costs are controlled by your account.

### Keeping your instance updated

To update your self-hosted copy, pull the latest changes from the repository:

```bash
git pull
npm install
```

For a local instance, restart the server after updating. For Vercel, run `vercel --prod` again from the linked project directory after pulling the changes.

## Support the public instance

The public AniBloom instance is currently hosted on Vercel's **Hobby plan**. Its resource and usage limits may affect response times or availability during periods of higher traffic.

If community donations become sufficient, I may move the public instance to a higher Vercel plan for more generous resource and usage limits. An upgrade may help accommodate more traffic, although it cannot guarantee faster responses in every situation.

If AniBloom is useful to you, you can support its ongoing maintenance and hosting through [Buy Me a Coffee](https://buymeacoffee.com/mark475). Donations are optional. You can also use the self-hosting instructions above and run your own instance.

## Privacy and operations

- [Public privacy and service-data disclosure](https://anibloom.vercel.app/privacy.html)
- [Operational incident-response runbook](docs/operations-incident-response.md)
- [Catalog upstream resilience](docs/catalog-resilience.md)

## Development

AniBloom is a JavaScript serverless addon deployed on Vercel.

- **Production:** `v2.15.0`
- **Development:** `v2.16.1`

Run the automated test suite:

```bash
npm install
npm test
```

## License

AniBloom is licensed under the MIT License. See [LICENSE](LICENSE).
