import { load } from "cheerio";

export type DiscoveredLink = {
  url: string;
  priority: number;
};

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesAny(url: string, globs: string[]): boolean {
  if (globs.length === 0) {
    return false;
  }
  return globs.some((glob) => {
    try {
      return globToRegExp(glob).test(url);
    } catch {
      return false;
    }
  });
}

export function normalizeLink(baseUrl: string, href: string): string | null {
  if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }
  try {
    const resolved = new URL(href, baseUrl);
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function discoverLinks(
  html: string,
  baseUrl: string,
  includeGlobs: string[],
  excludeGlobs: string[],
  isInScope: (url: string) => boolean,
): DiscoveredLink[] {
  const $ = load(html);
  const seen = new Set<string>();
  const links: DiscoveredLink[] = [];

  const pushCandidate = (href: string, priority: number): void => {
    const normalized = normalizeLink(baseUrl, href.trim());
    if (!normalized || seen.has(normalized)) {
      return;
    }
    if (!isHttpUrl(normalized)) {
      return;
    }
    if (!isInScope(normalized)) {
      return;
    }
    if (excludeGlobs.length > 0 && matchesAny(normalized, excludeGlobs)) {
      return;
    }
    if (includeGlobs.length > 0 && !matchesAny(normalized, includeGlobs)) {
      return;
    }
    seen.add(normalized);
    links.push({ url: normalized, priority });
  };

  $("a[rel='next']").each((_index, element) => pushCandidate($(element).attr("href") || "", 95));
  $("a[href]").each((_index, element) => {
    const href = ($(element).attr("href") || "").trim();
    const text = $(element).text().toLowerCase();
    if (text.includes("next") || text.includes("older") || /[?&]page=\d+/i.test(href)) {
      pushCandidate(href, 80);
      return;
    }
    pushCandidate(href, 50);
  });

  return links.slice(0, 1000);
}
