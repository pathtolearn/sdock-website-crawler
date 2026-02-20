export type CrawlerType = "camoufox" | "playwright" | "http:fast";
export type HtmlTransformer = "none" | "readable" | "markdown";
export type ScopeMode = "sameDomainSubdomains" | "sameHostname" | "anyDomain" | "customAllowlist";

export type CrawlerInput = {
  startUrls: string[];
  crawlerType: CrawlerType;
  scopeMode: ScopeMode;
  allowedDomains: string[];
  includeGlobs: string[];
  excludeGlobs: string[];
  maxDepth: number;
  maxPages: number;
  maxRuntimeSeconds: number;
  maxIdleCycles: number;
  respectRobots: boolean;
  waitForDynamicContentSeconds: number;
  waitForSelector: string;
  clickSelectors: string[];
  removeCookieWarnings: boolean;
  removeNavigationElements: boolean;
  htmlTransformer: HtmlTransformer;
  removeCssSelectors: string[];
  keepCssSelectors: string[];
  saveHtml: boolean;
  saveMarkdown: boolean;
  saveText: boolean;
  includeImageLinks: boolean;
  includeAudioLinks: boolean;
  includeVideoLinks: boolean;
  maxResults: number;
};

const KNOWN_KEYS = new Set<string>([
  "startUrls",
  "crawlerType",
  "scopeMode",
  "allowedDomains",
  "includeGlobs",
  "excludeGlobs",
  "maxDepth",
  "maxCrawlDepth",
  "maxPages",
  "maxRuntimeSeconds",
  "maxIdleCycles",
  "respectRobots",
  "waitForDynamicContentSeconds",
  "waitForSelector",
  "clickSelectors",
  "removeCookieWarnings",
  "removeNavigationElements",
  "htmlTransformer",
  "removeCssSelectors",
  "keepCssSelectors",
  "saveHtml",
  "saveMarkdown",
  "saveText",
  "includeImageLinks",
  "includeAudioLinks",
  "includeVideoLinks",
  "maxResults",
]);

const DEFAULTS: Omit<CrawlerInput, "startUrls"> = {
  crawlerType: "camoufox",
  scopeMode: "sameDomainSubdomains",
  allowedDomains: [],
  includeGlobs: [],
  excludeGlobs: [],
  maxDepth: 20,
  maxPages: 500,
  maxRuntimeSeconds: 1800,
  maxIdleCycles: 5,
  respectRobots: true,
  waitForDynamicContentSeconds: 2,
  waitForSelector: "",
  clickSelectors: [],
  removeCookieWarnings: true,
  removeNavigationElements: true,
  htmlTransformer: "markdown",
  removeCssSelectors: [],
  keepCssSelectors: [],
  saveHtml: false,
  saveMarkdown: true,
  saveText: true,
  includeImageLinks: true,
  includeAudioLinks: true,
  includeVideoLinks: true,
  maxResults: 50000,
};

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown, key: string, required: boolean): string[] {
  if (value === undefined || value === null) {
    if (required) {
      throw new InputValidationError(`${key} is required`);
    }
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InputValidationError(`${key} must be an array of strings`);
  }
  const out = value.map((item) => {
    if (typeof item !== "string") {
      throw new InputValidationError(`${key} must contain only strings`);
    }
    return item.trim();
  });
  return out.filter((item) => item.length > 0);
}

function asBoolean(value: unknown, key: string, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new InputValidationError(`${key} must be a boolean`);
  }
  return value;
}

function asEnum<T extends string>(value: unknown, key: string, allowed: readonly T[], fallback: T): T {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InputValidationError(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function normalizeCrawlerType(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "playwright:adaptive") {
    return "playwright";
  }
  return value;
}

function asNumber(value: unknown, key: string, fallback: number, min: number, max: number, integer = false): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new InputValidationError(`${key} must be a valid number`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new InputValidationError(`${key} must be an integer`);
  }
  if (value < min || value > max) {
    throw new InputValidationError(`${key} must be between ${min} and ${max}`);
  }
  return value;
}

function asString(value: unknown, key: string, fallback: string): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new InputValidationError(`${key} must be a string`);
  }
  return value.trim();
}

function normalizeDomain(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (candidate.length === 0) {
    throw new InputValidationError("allowedDomains entries cannot be empty");
  }
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate);
    const parsed = new URL(hasScheme ? candidate : `http://${candidate}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new InputValidationError(`allowedDomains entry must be a domain or http(s) URL: ${value}`);
    }
    if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
      throw new InputValidationError(`allowedDomains entry must not include credentials, port, query, or fragment: ${value}`);
    }
    if (parsed.pathname && parsed.pathname !== "/") {
      throw new InputValidationError(`allowedDomains entry must not include a path: ${value}`);
    }
    if (!parsed.hostname || parsed.hostname.includes(" ")) {
      throw new InputValidationError(`allowedDomains entry must be a valid hostname: ${value}`);
    }
    return parsed.hostname.toLowerCase();
  } catch (error) {
    if (error instanceof InputValidationError) {
      throw error;
    }
    throw new InputValidationError(`allowedDomains entry must be a valid domain/hostname: ${value}`);
  }
}

function asDomainArray(value: unknown): string[] {
  const values = asStringArray(value, "allowedDomains", false);
  const normalized = values.map((item) => normalizeDomain(item));
  return [...new Set(normalized)];
}

function validateUrls(urls: string[]): string[] {
  if (urls.length === 0) {
    throw new InputValidationError("startUrls must contain at least one URL");
  }
  return urls.map((url) => {
    try {
      const parsed = new URL(url);
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("Invalid protocol");
      }
      return parsed.toString();
    } catch {
      throw new InputValidationError(`Invalid URL in startUrls: ${url}`);
    }
  });
}

export function parseRuntimeInput(raw: unknown): CrawlerInput {
  if (!isObject(raw)) {
    throw new InputValidationError("Input payload must be a JSON object");
  }

  const sanitizedRaw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (KNOWN_KEYS.has(key)) {
      sanitizedRaw[key] = value;
    }
  }

  const startUrls = validateUrls(asStringArray(sanitizedRaw.startUrls, "startUrls", true));
  const normalizedCrawlerType = normalizeCrawlerType(sanitizedRaw.crawlerType);
  const maxDepthInput = sanitizedRaw.maxDepth ?? sanitizedRaw.maxCrawlDepth;
  const scopeMode = asEnum(
    sanitizedRaw.scopeMode,
    "scopeMode",
    ["sameDomainSubdomains", "sameHostname", "anyDomain", "customAllowlist"],
    DEFAULTS.scopeMode,
  );
  const allowedDomains = asDomainArray(sanitizedRaw.allowedDomains);
  if (scopeMode === "customAllowlist" && allowedDomains.length === 0) {
    throw new InputValidationError("allowedDomains must contain at least one domain when scopeMode=customAllowlist");
  }

  return {
    startUrls,
    crawlerType: asEnum(normalizedCrawlerType, "crawlerType", ["camoufox", "playwright", "http:fast"], DEFAULTS.crawlerType),
    scopeMode,
    allowedDomains,
    includeGlobs: asStringArray(sanitizedRaw.includeGlobs, "includeGlobs", false),
    excludeGlobs: asStringArray(sanitizedRaw.excludeGlobs, "excludeGlobs", false),
    maxDepth: asNumber(maxDepthInput, "maxDepth", DEFAULTS.maxDepth, 0, 100, true),
    maxPages: asNumber(sanitizedRaw.maxPages, "maxPages", DEFAULTS.maxPages, 1, 100000, true),
    maxRuntimeSeconds: asNumber(sanitizedRaw.maxRuntimeSeconds, "maxRuntimeSeconds", DEFAULTS.maxRuntimeSeconds, 10, 86400, true),
    maxIdleCycles: asNumber(sanitizedRaw.maxIdleCycles, "maxIdleCycles", DEFAULTS.maxIdleCycles, 1, 100, true),
    respectRobots: asBoolean(sanitizedRaw.respectRobots, "respectRobots", DEFAULTS.respectRobots),
    waitForDynamicContentSeconds: asNumber(
      sanitizedRaw.waitForDynamicContentSeconds,
      "waitForDynamicContentSeconds",
      DEFAULTS.waitForDynamicContentSeconds,
      0,
      60,
      false,
    ),
    waitForSelector: asString(sanitizedRaw.waitForSelector, "waitForSelector", DEFAULTS.waitForSelector),
    clickSelectors: asStringArray(sanitizedRaw.clickSelectors, "clickSelectors", false),
    removeCookieWarnings: asBoolean(sanitizedRaw.removeCookieWarnings, "removeCookieWarnings", DEFAULTS.removeCookieWarnings),
    removeNavigationElements: asBoolean(sanitizedRaw.removeNavigationElements, "removeNavigationElements", DEFAULTS.removeNavigationElements),
    htmlTransformer: asEnum(sanitizedRaw.htmlTransformer, "htmlTransformer", ["none", "readable", "markdown"], DEFAULTS.htmlTransformer),
    removeCssSelectors: asStringArray(sanitizedRaw.removeCssSelectors, "removeCssSelectors", false),
    keepCssSelectors: asStringArray(sanitizedRaw.keepCssSelectors, "keepCssSelectors", false),
    saveHtml: asBoolean(sanitizedRaw.saveHtml, "saveHtml", DEFAULTS.saveHtml),
    saveMarkdown: asBoolean(sanitizedRaw.saveMarkdown, "saveMarkdown", DEFAULTS.saveMarkdown),
    saveText: asBoolean(sanitizedRaw.saveText, "saveText", DEFAULTS.saveText),
    includeImageLinks: asBoolean(sanitizedRaw.includeImageLinks, "includeImageLinks", DEFAULTS.includeImageLinks),
    includeAudioLinks: asBoolean(sanitizedRaw.includeAudioLinks, "includeAudioLinks", DEFAULTS.includeAudioLinks),
    includeVideoLinks: asBoolean(sanitizedRaw.includeVideoLinks, "includeVideoLinks", DEFAULTS.includeVideoLinks),
    maxResults: asNumber(sanitizedRaw.maxResults, "maxResults", DEFAULTS.maxResults, 1, 1000000, true),
  };
}
