export type CrawlerType = "camoufox" | "playwright" | "http:fast";
export type HtmlTransformer = "none" | "readable" | "markdown";

export type CrawlerInput = {
  startUrls: string[];
  crawlerType: CrawlerType;
  includeGlobs: string[];
  excludeGlobs: string[];
  maxDepth: number;
  maxPages: number;
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
  maxResults: number;
};

const KNOWN_KEYS = new Set<string>([
  "startUrls",
  "crawlerType",
  "includeGlobs",
  "excludeGlobs",
  "maxDepth",
  "maxPages",
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
  "maxResults",
]);

const DEFAULTS: Omit<CrawlerInput, "startUrls"> = {
  crawlerType: "camoufox",
  includeGlobs: [],
  excludeGlobs: [],
  maxDepth: 20,
  maxPages: 500,
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

  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new InputValidationError(`Unknown input field: ${key}`);
    }
  }

  const startUrls = validateUrls(asStringArray(raw.startUrls, "startUrls", true));

  return {
    startUrls,
    crawlerType: asEnum(raw.crawlerType, "crawlerType", ["camoufox", "playwright", "http:fast"], DEFAULTS.crawlerType),
    includeGlobs: asStringArray(raw.includeGlobs, "includeGlobs", false),
    excludeGlobs: asStringArray(raw.excludeGlobs, "excludeGlobs", false),
    maxDepth: asNumber(raw.maxDepth, "maxDepth", DEFAULTS.maxDepth, 0, 100, true),
    maxPages: asNumber(raw.maxPages, "maxPages", DEFAULTS.maxPages, 1, 100000, true),
    respectRobots: asBoolean(raw.respectRobots, "respectRobots", DEFAULTS.respectRobots),
    waitForDynamicContentSeconds: asNumber(
      raw.waitForDynamicContentSeconds,
      "waitForDynamicContentSeconds",
      DEFAULTS.waitForDynamicContentSeconds,
      0,
      60,
      false,
    ),
    waitForSelector: asString(raw.waitForSelector, "waitForSelector", DEFAULTS.waitForSelector),
    clickSelectors: asStringArray(raw.clickSelectors, "clickSelectors", false),
    removeCookieWarnings: asBoolean(raw.removeCookieWarnings, "removeCookieWarnings", DEFAULTS.removeCookieWarnings),
    removeNavigationElements: asBoolean(raw.removeNavigationElements, "removeNavigationElements", DEFAULTS.removeNavigationElements),
    htmlTransformer: asEnum(raw.htmlTransformer, "htmlTransformer", ["none", "readable", "markdown"], DEFAULTS.htmlTransformer),
    removeCssSelectors: asStringArray(raw.removeCssSelectors, "removeCssSelectors", false),
    keepCssSelectors: asStringArray(raw.keepCssSelectors, "keepCssSelectors", false),
    saveHtml: asBoolean(raw.saveHtml, "saveHtml", DEFAULTS.saveHtml),
    saveMarkdown: asBoolean(raw.saveMarkdown, "saveMarkdown", DEFAULTS.saveMarkdown),
    saveText: asBoolean(raw.saveText, "saveText", DEFAULTS.saveText),
    maxResults: asNumber(raw.maxResults, "maxResults", DEFAULTS.maxResults, 1, 1000000, true),
  };
}
