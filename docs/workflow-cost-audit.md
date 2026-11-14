# GitHub workflow and hosted-request audit — November 14, 2026

The merge of PR #571 passed main CI, the full Git-history secret scan and
CodeQL. The controlled release job was **skipped**, so that merge did not run
the deployment hook or production smoke/validation steps. An automated version
metadata PR (#572) was opened by the existing version job; it is separate from
the runtime changes.

- [Successful main CI](https://github.com/AniBloomHQ/AniBloom/actions/runs/43598450420)
- [Skipped controlled release](https://github.com/AniBloomHQ/AniBloom/actions/runs/43598450422)
- [Previous explicit release failure](https://github.com/AniBloomHQ/AniBloom/actions/runs/43411183107)

## Which workflows can use hosted function capacity?

| Workflow | Trigger | Calls hosted AniBloom/Vercel? |
| --- | --- | --- |
| `pr-ci.yml` | PR/manual | No production smoke or deployment; Node tests and localhost Chrome checks |
| `ci.yml` | Main push | No production smoke or deployment; tests and version metadata automation |
| `secret-history-scan.yml` | PR/main/manual | GitHub/Gitleaks downloads and local Git scanning, no addon calls |
| CodeQL | GitHub code scanning | Static analysis, no addon smoke or deployment |
| `catalog-diff.yml` | Manual | Reads stored snapshot branches and compares files locally |
| `upstash-redis-usage.yml` | Weekly/manual | Reads Upstash usage, not the addon |
| `catalog-snapshot.yml` | Manual only | Yes: manifest plus all catalog pages, with retries |
| `sync-version.yml` | Explicit release marker/manual | Yes: deploy hook, manifest readiness, catalog smoke, optional exhaustive validation |

Tests use mocked endpoints and local servers for the addon contract. Some
provider fixtures can still reach public mapping providers; these are not the
hosted AniBloom catalog. A hostname such as `idmapper.vercel.app` is a third-party
provider, not an invocation charged to the AniBloom project.

Vercel's PR status reporting an account block is not evidence that application
code ran. GitHub runner minutes and Vercel function usage are separate. On
Fluid Compute, waiting for provider I/O is not active CPU time, although
invocations and provisioned memory are separate usage dimensions. Local elapsed
time improvements cannot be converted directly into monthly Vercel CPU savings.
[Vercel function usage documentation](https://vercel.com/docs/functions/usage-and-pricing).

## Recommended changes, before hosted use resumes

The following safeguards have now been implemented and tested in local workflow
source in response to the owner's follow-up:

- `dry_run` defaults to no hosted requests. `live_validation: true` explicitly
  enables the former live audit; deploy/finalize keep their required live checks.
  Conflicting modes are rejected.
- The existing GitHub Vercel-status preflight rejects a confirmed account block
  before the deploy hook and readiness polling.
- Full validation allows 100 HTTP attempts by default, counted inside retries.
  The manual snapshot has a `max_requests` input (default 100, range 1–1000),
  shared across manifest, pages and retries even across shell subshells.
  Exhaustion fails the job and does not publish a complete capture/release.
- Snapshot manifest retries now use the same terminal-status handling as page
  requests; a 401/403/404 does not get the former blanket retries.

The remaining recommendations are response reuse and tighter readiness/smoke
budgets. These safeguards do not remove mandatory release validation or make
partial captures count as successful.

1. **Fail early on the known account block.** The explicit release already reads
   the target commit's Vercel status before invoking the deploy hook. If that
   status explicitly says the account is blocked, stop there with a clear error,
   instead of posting a hook and polling the manifest. The previous release
   failed at production smoke after the hook step succeeded. A successful hook
   response does not prove a deployment succeeded.
2. **Separate an offline dry run from a live production audit.** The present
   `dry_run` avoids deployment/tag/state writes but still calls production and
   requests full validation. Require a separate explicit live-request choice;
   let an offline dry run perform tests and release-integrity checks only.
3. **Use explicit request budgets.** Readiness permits 30 manifest requests.
   The representative smoke suite repeats up to three times and can refetch
   successful pages when another check fails. Retry each transient failing URL,
   honor `Retry-After`, and retain successful responses for later validation.
   Do not retry terminal 401/403/404 responses as readiness failures.
4. **Keep exhaustive crawls separate from routine release readiness.** Both the
   snapshot workflow and full validator allow up to 1,000 pages per catalog in
   their code, subject to server guards and job timeouts. Use a reviewed total
   request ceiling and stop without publishing a complete snapshot when that
   ceiling is reached. Never label a budget-truncated capture complete.
5. **Reuse snapshots for repeated comparison.** The manual diff workflow is
   already offline. Capture once when a deployed release needs auditing, then
   compare the stored artifact/branch instead of repeatedly crawling Vercel.
6. **Optimize GitHub minutes separately.** npm download caching could reduce
   repeated installs; keeping PR/main checks protects integration coverage.
   Version-only PRs still run full checks today. Any narrower checks must retain
   the required status names and validate version metadata; disabling code or
   security checks would not solve Vercel CPU use.

No production requests, workflow dispatches, hosted account/project configuration
changes or deployment attempts were made for this work. Workflow safeguards can
be published through the normal PR/required-CI path without invoking a release.
The local cache benchmarks reject requests to `anibloom.vercel.app` and contact
public providers directly.
