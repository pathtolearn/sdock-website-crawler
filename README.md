# Website Content Crawler Actor

Standalone StealthDock Actor for website crawling and content extraction with schema-driven input.

## What this actor provides

- GitHub-importable actor contract for StealthDock real build mode.
- Screenshot-style input sections using JSON schema UI metadata.
- Queue-based runtime integration (`/v2/internal/runs/{run_id}/...`).
- Browser-capable crawling with `camoufox` + `playwright`, with fallback to Playwright when Camoufox is unavailable.
- Per-page structured dataset output aligned to `output.schema.json`.

## Required StealthDock runtime flags (real import + real runtime)

Set these before running workers:

```bash
export STEALTHDOCK_BUILD_REAL_MODE=1
export STEALTHDOCK_REAL_ACTOR_RUNTIME=1
export STEALTHDOCK_EXECUTOR_REAL_MODE=1
```

Optional for Camoufox availability signaling:

```bash
export STEALTHDOCK_CAMOUFOX_ENABLED=1
```

## Local project setup

```bash
npm install
npm run test
npm run smoke
```

## Import into StealthDock app

1. Push this folder as a public GitHub repository.
2. In StealthDock Actors page, use **Import Actor (GitHub)**.
3. Enter:
- `repo_url`: `https://github.com/<org>/<repo>`
- `ref`: commit SHA (recommended) or ref name
4. Wait for job status `verified`.

Important constraints from current importer:

- Only `https://github.com/...` public repositories are accepted.
- Contract files must exist at repository root.
- `subpath` is currently ignored by the backend build worker, so do not place contract files in subfolders.

## Run in StealthDock

1. Open the imported actor.
2. Use the Information tab (Form mode) with `startUrls` and crawl settings.
3. Click **Save & Start**.
4. Check Runs and Dataset preview for output records.

## Input schema behavior

Core fields:

- `startUrls` (required)
- `crawlerType` (`camoufox` | `playwright` | `http:fast`)
- `scopeMode` (`sameDomainSubdomains` | `sameHostname` | `anyDomain` | `customAllowlist`)
- `allowedDomains` (used by `customAllowlist`)
- `includeGlobs`, `excludeGlobs`, `maxDepth`, `maxPages`, `maxRuntimeSeconds`, `maxIdleCycles`, `respectRobots`
- `waitForDynamicContentSeconds`, `waitForSelector`, `clickSelectors`
- `removeCookieWarnings`, `removeNavigationElements`
- `htmlTransformer`, `removeCssSelectors`, `keepCssSelectors`
- `saveHtml`, `saveMarkdown`, `saveText`, `maxResults`
- `includeImageLinks`, `includeAudioLinks`, `includeVideoLinks`

## Notes on advanced fields

Implemented in v1:

- Core crawl limits (`maxDepth`, `maxPages`, `maxResults`, `maxRuntimeSeconds`, `maxIdleCycles`)
- Domain scope controls with same-domain/subdomain default
- Include/exclude URL glob filtering
- Browser waiting and click selectors (browser modes)
- CSS removal/keep selector extraction controls
- Robots checks (`respectRobots`) with per-origin cache
- Media URL extraction (image/audio/video) into metadata

Best-effort / limited behavior in v1:

- `camoufox` currently uses Playwright execution path; engine selection and fallback events are still tracked.
- `http:fast` skips browser-only actions (`waitForSelector`, `clickSelectors`) by design.

## Output records

Each dataset item includes:

- `url`, `final_url`, `status_code`, `fetched_at`
- `title`, `description`, `content_text`, `content_markdown`
- `links`, `language`, `metadata`

Optional HTML is stored in `metadata.html` when `saveHtml=true`.
Extracted media URLs are stored in `metadata.media_links` with `images`, `audio`, `video`, and per-type counts.
