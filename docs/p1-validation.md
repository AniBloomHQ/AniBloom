# P1 offline validation and self-hosting

All checks in this document run without Vercel deployments or third-party API requests. These features are **merged source only until an authorized production release**.

## Secure self-hosted public origin

Set `ANIBLOOM_PUBLIC_ORIGIN` to your publicly reachable **HTTPS origin only** (e.g. `https://anime.example.org`). This setting is optional: when omitted, official AniBloom production URLs remain the default. No extra addon, proxy service, account, or credential is required.

A valid origin updates manifest logo URLs, homepage catalog card links, manual installation links, and the language selector's Nuvio install URLs. The server **never derives a public origin from the request Host or X-Forwarded-Host header**; supplying an invalid value raises a configuration error without logging the value.

Only during local non-production development can the origin use HTTP for loopback/private LAN addresses, for example `ANIBLOOM_PUBLIC_ORIGIN=http://localhost:3000 npm run dev` or `ANIBLOOM_PUBLIC_ORIGIN=http://192.168.1.12:3000 npm run dev`. Public Vercel/production deployments require HTTPS. Do **not** put API keys, username/password, paths, query strings, or fragments in the environment variable. Self-hosted clients outside your LAN may need public HTTPS and a valid certificate; the development server does not add TLS or DNS by itself.

Changing an installed addon URL can create duplicate Home rows in some Nuvio builds; remove the previous installation if necessary. Neither this configuration nor any of these checks modify the official production deployment.

## Headless browser regression

GitHub's PR and main CI run `node scripts/browser-home-smoke.mjs` after normal Node tests. The script uses the runner's existing Chrome/Chromium executable, a temporary local preview server and a local proxy that injects test-only DOM assertions; production files, live network endpoints and dependencies are unchanged.

It checks both desktop and a mobile-sized viewport, all nine rendered catalog cards and nonempty SVG icons (including Top Anime's trophy), grid responsiveness, English/Romaji/Native language selector events, HTTPS manual installation links, and Nuvio deep links. Browser output is limited to pass/fail details and anonymous viewport/card counts. The proxy and Chrome processes are stopped after the check. If Chrome is not present, the check **fails** rather than silently skipping UI validation. No screenshots or tokens are uploaded as artifacts.

## Mocked cache / identity fan-out profile

Run `node scripts/profile-catalog-cache.mjs` locally or in GitHub's test environment. The profile reuses the same **two isolated workers and intercepted fake HTTP/Redis/upstream endpoints** as `test/catalog-refresh-cross-instance.test.js`. All simulated upstream requests are handled by a loopback fixture; it never reaches the actual AniList, ARM, mapping providers, or Vercel.

It measures aggregate request counts for four scenarios:

| Scenario | Expected AniList calls | ARM calls | Other mocked provider requests | Writes |
| --- | ---: | ---: | ---: | ---: |
| Simultaneous cold misses | 1 | 1 | 16 | 1 |
| Shared fresh catalog (warm) | 0 | 0 | 0 | 0 |
| Simultaneous stale refreshes | 1 | 1 | 16 | 1 |
| Shared Redis lock unavailable | 2 | 2 | 32 | 2 |

These are deterministic fixture counts, **not measured production requests, Vercel CPU, billing or real latency percentiles**. Elapsed wall-clock time is included only to detect large *local* regressions; do not extrapolate it into a capacity or cost estimate. The report includes no media identifiers, titles, client IP addresses, personal search text, URLs or credentials. Do not use cold-cache live load tests to attempt to recreate this profile.

## Decision gate for further optimization

Only modify the provider chain, cache TTL, response schema or request budget if a measurable issue is reproduced and regression coverage preserves canonical title identity, version compatibility, error handling, stale fallback and cold-cache behavior. Avoid speculative removal of fallback identity providers; a "faster" resolver can open the wrong anime title. Current production observability remains deferred under [issue #511](https://github.com/AniBloomHQ/AniBloom/issues/511); do not reinstate the removed scheduled availability monitor.
