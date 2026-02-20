import { chromium } from "playwright";
import robotsParser from "robots-parser";

import { selectEngine } from "./engine";
import { extractContent } from "./extract";
import { CrawlerInput, parseRuntimeInput, InputValidationError } from "./input";
import { discoverLinks } from "./pagination";
import { playwrightProxyConfig, proxyFetch, proxyRuntimeEventPayload, readProxySettings, type RuntimeProxySettings } from "./proxy";
import { ack, bootstrap, enqueue, event, fail, lease, pushDataset } from "./runtimeClient";
import { createScopeMatcher } from "./scope";
import { evaluateStopReason, StopReason } from "./stopPolicy";

type RobotsParser = ReturnType<typeof robotsParser>;

type FailureClass = {
  type: "network" | "parse" | "blocked" | "policy" | "budget" | "infra";
  retryable: boolean;
  reason: string;
};

type FetchedPage = {
  status: number;
  finalUrl: string;
  html: string;
  fetchEngine: "playwright" | "http:fast";
  fallbackReason?: string;
};

const USER_AGENT = "StealthDockWebsiteContentCrawler/1.0 (+https://stealthdock.local)";
const ROBOTS_CACHE = new Map<string, RobotsParser | null>();

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function classifyFailure(error: unknown, statusCode: number | null): FailureClass {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || statusCode === 429 || lower.includes("captcha") || lower.includes("blocked")) {
    return { type: "blocked", retryable: true, reason: message };
  }
  if (lower.includes("budget") || lower.includes("max results") || lower.includes("max pages")) {
    return { type: "budget", retryable: false, reason: message };
  }
  if (lower.includes("robots") || lower.includes("policy") || lower.includes("depth")) {
    return { type: "policy", retryable: false, reason: message };
  }
  if (lower.includes("parse") || lower.includes("extract") || lower.includes("invalid input")) {
    return { type: "parse", retryable: false, reason: message };
  }
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("fetch") || lower.includes("socket")) {
    return { type: "network", retryable: true, reason: message };
  }
  return { type: "infra", retryable: false, reason: message };
}

async function fetchWithHttp(url: string, proxySettings: RuntimeProxySettings): Promise<FetchedPage> {
  const response = await proxyFetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
  }, proxySettings);
  const html = await response.text();
  return {
    status: response.status,
    finalUrl: response.url || url,
    html,
    fetchEngine: "http:fast",
  };
}

async function fetchWithPlaywright(url: string, input: CrawlerInput, proxySettings: RuntimeProxySettings): Promise<FetchedPage> {
  const navigationTimeoutMs = proxySettings.enabled ? 90000 : 45000;
  const browser = await chromium.launch({
    headless: true,
    proxy: playwrightProxyConfig(proxySettings),
  });
  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });

    if (input.waitForDynamicContentSeconds > 0) {
      await page.waitForTimeout(input.waitForDynamicContentSeconds * 1000);
    }

    if (input.waitForSelector) {
      await page.waitForSelector(input.waitForSelector, { timeout: 15000 });
    }

    for (const selector of input.clickSelectors) {
      try {
        await page.locator(selector).first().click({ timeout: 5000 });
      } catch {
        continue;
      }
    }

    const html = await page.content();
    return {
      status: response?.status() ?? 200,
      finalUrl: page.url() || url,
      html,
      fetchEngine: "playwright",
    };
  } finally {
    await browser.close();
  }
}

function shouldFallbackToHttp(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("net::err_proxy_connection_failed") ||
    message.includes("net::err_tunnel_connection_failed") ||
    message.includes("net::err_connection_reset") ||
    message.includes("net::err_connection_timed_out")
  );
}

async function fetchPage(
  url: string,
  selectedEngine: "camoufox" | "playwright" | "http:fast",
  input: CrawlerInput,
  proxySettings: RuntimeProxySettings,
): Promise<FetchedPage> {
  if (selectedEngine === "http:fast") {
    return fetchWithHttp(url, proxySettings);
  }
  try {
    return await fetchWithPlaywright(url, input, proxySettings);
  } catch (error) {
    if (!shouldFallbackToHttp(error)) {
      throw error;
    }
    const fallback = await fetchWithHttp(url, proxySettings);
    return {
      ...fallback,
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadRobots(url: string, proxySettings: RuntimeProxySettings): Promise<RobotsParser | null> {
  const origin = new URL(url).origin;
  if (ROBOTS_CACHE.has(origin)) {
    return ROBOTS_CACHE.get(origin) || null;
  }

  try {
    const robotsUrl = `${origin}/robots.txt`;
    const response = await proxyFetch(robotsUrl, {
      headers: {
        "user-agent": USER_AGENT,
      },
    }, proxySettings);
    const text = await response.text();
    const parser = robotsParser(robotsUrl, text);
    ROBOTS_CACHE.set(origin, parser);
    return parser;
  } catch {
    ROBOTS_CACHE.set(origin, null);
    return null;
  }
}

async function isAllowedByRobots(
  url: string,
  respectRobots: boolean,
  proxySettings: RuntimeProxySettings,
): Promise<boolean> {
  if (!respectRobots) {
    return true;
  }
  const parser = await loadRobots(url, proxySettings);
  if (!parser) {
    return true;
  }
  return parser.isAllowed(url, USER_AGENT) !== false;
}

async function main(): Promise<void> {
  console.log("Bootstrapping runtime...");
  const runtime = await bootstrap();
  console.log(`Runtime bootstrap complete for run ${runtime.run.id}`);
  const proxySettings = readProxySettings();

  let input: CrawlerInput;
  try {
    input = parseRuntimeInput(runtime.run.input || {});
  } catch (error) {
    const message = error instanceof InputValidationError ? error.message : "Invalid input";
    await event("runtime.input_invalid", { error: message }, undefined, "runtime", message, "error");
    throw new Error(`Invalid input: ${message}`);
  }

  const engineResolution = selectEngine(input.crawlerType);
  const selectedEngine = engineResolution.selected;
  const scopeMatcher = createScopeMatcher(input.startUrls, input.scopeMode, input.allowedDomains);
  const queueDrainedIdleThreshold = Math.min(2, input.maxIdleCycles);

  if (engineResolution.fallbackReason) {
    await event(
      "engine.fallback",
      {
        requested: engineResolution.requested,
        selected: engineResolution.selected,
        reason: engineResolution.fallbackReason,
      },
      undefined,
      "runtime",
      "Camoufox unavailable; fallback to Playwright",
      "warning",
    );
  }

  const minConcurrency = Math.max(1, toNumber(runtime.run.concurrency.min_concurrency, 1));
  const maxConcurrency = Math.max(minConcurrency, toNumber(runtime.run.concurrency.max_concurrency, minConcurrency));
  let currentConcurrency = minConcurrency;
  const workerId = `${process.env.HOSTNAME || "worker"}-${Date.now()}`;

  await event(
    "runtime.started",
      {
        worker_id: workerId,
        requested_engine: engineResolution.requested,
        selected_engine: selectedEngine,
        scope_mode: input.scopeMode,
        respect_robots: input.respectRobots,
      },
    undefined,
    "runtime",
  );
  if (proxySettings.enabled) {
    await event("proxy.client.applied", proxyRuntimeEventPayload(proxySettings), undefined, "proxy");
  }

  let processedPages = 0;
  let emittedResults = 0;
  let idleCycles = 0;
  const startedAtMs = Date.now();
  let stopReason: StopReason | null = null;

  while (true) {
    stopReason = evaluateStopReason({
      startedAtMs,
      nowMs: Date.now(),
      maxRuntimeSeconds: input.maxRuntimeSeconds,
      processedPages,
      maxPages: input.maxPages,
      emittedResults,
      maxResults: input.maxResults,
      idleCycles,
      maxIdleCycles: input.maxIdleCycles,
      queueDrainedIdleThreshold,
    });
    if (stopReason) {
      break;
    }

    const leased = await lease(workerId, currentConcurrency, 60);
    if (leased.length === 0) {
      idleCycles += 1;
      console.log(
        `No requests leased (idle=${idleCycles}, processed=${processedPages}, emitted=${emittedResults}, concurrency=${currentConcurrency})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    console.log(
      `Leased ${leased.length} request(s) at concurrency ${currentConcurrency} (processed=${processedPages}, emitted=${emittedResults})`,
    );
    idleCycles = 0;

    for (const item of leased) {
      stopReason = evaluateStopReason({
        startedAtMs,
        nowMs: Date.now(),
        maxRuntimeSeconds: input.maxRuntimeSeconds,
        processedPages,
        maxPages: input.maxPages,
        emittedResults,
        maxResults: input.maxResults,
        idleCycles,
        maxIdleCycles: input.maxIdleCycles,
        queueDrainedIdleThreshold,
      });
      if (stopReason) {
        await fail(item.request_id, "budget", `Run stop criteria reached (${stopReason})`, false, null, 0);
        continue;
      }

      const depth = toNumber(item.metadata?.depth, 0);
      if (depth > input.maxDepth) {
        await fail(item.request_id, "policy", `Max depth exceeded (${input.maxDepth})`, false, null, 0);
        continue;
      }

      const allowed = await isAllowedByRobots(item.url, input.respectRobots, proxySettings);
      if (!allowed) {
        await fail(item.request_id, "policy", "Blocked by robots.txt", false, 403, 0);
        continue;
      }

      const started = Date.now();
      let statusCode: number | null = null;
      try {
        const fetched = await fetchPage(item.url, selectedEngine, input, proxySettings);
        statusCode = fetched.status;
        if (fetched.fetchEngine !== selectedEngine) {
          await event(
            "engine.fallback",
            {
              requested: selectedEngine,
              selected: fetched.fetchEngine,
              reason: "playwright_navigation_timeout_or_proxy_error",
            },
            item.request_id,
            "request",
            fetched.fallbackReason || "playwright fetch failed; fallback to http:fast",
            "warning",
          );
        }

        if ([401, 403, 429].includes(fetched.status)) {
          throw new Error(`Blocked with status ${fetched.status}`);
        }

        const extracted = extractContent(fetched.html, item.url, fetched.finalUrl, {
          removeCookieWarnings: input.removeCookieWarnings,
          removeNavigationElements: input.removeNavigationElements,
          removeCssSelectors: input.removeCssSelectors,
          keepCssSelectors: input.keepCssSelectors,
          htmlTransformer: input.htmlTransformer,
          includeImageLinks: input.includeImageLinks,
          includeAudioLinks: input.includeAudioLinks,
          includeVideoLinks: input.includeVideoLinks,
          isInScope: scopeMatcher,
        });

        const discoveredLinks = discoverLinks(fetched.html, fetched.finalUrl, input.includeGlobs, input.excludeGlobs, scopeMatcher);
        await enqueue(
          discoveredLinks.map((link) => ({
            url: link.url,
            discovered_from_request_id: item.request_id,
            priority: link.priority,
            metadata: {
              depth: depth + 1,
              discovered_by: item.request_id,
            },
          })),
        );

        const record: Record<string, unknown> = {
          url: item.url,
          final_url: fetched.finalUrl,
          status_code: fetched.status,
          fetched_at: new Date().toISOString(),
          title: extracted.title,
          description: extracted.description,
          content_text: input.saveText ? extracted.content_text : null,
          content_markdown: input.saveMarkdown ? extracted.content_markdown : null,
          links: extracted.links,
          language: extracted.language,
          metadata: {
            ...extracted.metadata,
            depth,
            selected_engine: selectedEngine,
            fetch_engine: fetched.fetchEngine,
            discovered_count: discoveredLinks.length,
            html: input.saveHtml ? extracted.cleaned_html : undefined,
          },
        };

        await pushDataset([record]);

        const latencyMs = Date.now() - started;
        await ack(item.request_id, fetched.status, latencyMs, {
          selected_engine: selectedEngine,
          fetch_engine: fetched.fetchEngine,
          depth,
          discovered_count: discoveredLinks.length,
        });

        processedPages += 1;
        emittedResults += 1;

        if (runtime.run.concurrency.autoscale_mode === "adaptive") {
          currentConcurrency = Math.min(maxConcurrency, currentConcurrency + 1);
        }

        await event(
          "request.succeeded",
          {
            url: item.url,
            status_code: fetched.status,
            depth,
            emitted_results: emittedResults,
            concurrency: currentConcurrency,
          },
          item.request_id,
          "request",
        );
        console.log(
          `Request succeeded url=${item.url} status=${fetched.status} depth=${depth} emitted=${emittedResults} concurrency=${currentConcurrency}`,
        );
      } catch (error) {
        const latencyMs = Date.now() - started;
        const classified = classifyFailure(error, statusCode);

        await fail(item.request_id, classified.type, classified.reason, classified.retryable, statusCode, latencyMs);

        if (runtime.run.concurrency.autoscale_mode === "adaptive") {
          currentConcurrency = Math.max(minConcurrency, currentConcurrency - 1);
        }

        await event(
          "request.failed",
          {
            url: item.url,
            error_type: classified.type,
            reason: classified.reason,
            concurrency: currentConcurrency,
          },
          item.request_id,
          "request",
          classified.reason,
          classified.type === "infra" ? "error" : "warning",
        );
        console.log(
          `Request failed url=${item.url} type=${classified.type} retryable=${classified.retryable} status=${statusCode ?? "none"} reason=${classified.reason}`,
        );
      }
    }
  }

  await event(
    "runtime.finished",
    {
      processed_pages: processedPages,
      emitted_results: emittedResults,
      max_pages: input.maxPages,
      max_results: input.maxResults,
      max_runtime_seconds: input.maxRuntimeSeconds,
      max_idle_cycles: input.maxIdleCycles,
      stop_reason: stopReason || "queue_drained",
      selected_engine: selectedEngine,
    },
    undefined,
    "runtime",
  );
}

main().catch(async (error) => {
  const reason = error instanceof Error ? error.message : String(error);
  // Emit crash reason to container logs for easier run-level diagnostics.
  console.error(reason);
  try {
    await event("runtime.crashed", { error: reason }, undefined, "runtime", reason, "error");
  } catch {
    // Avoid masking original failure if events endpoint is unavailable.
  }
  process.exitCode = 1;
});
