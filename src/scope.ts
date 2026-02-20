import { parse } from "tldts";

import type { ScopeMode } from "./input";

export type ScopeMatcher = (url: string) => boolean;

function isHostnameOrSubdomain(hostname: string, candidate: string): boolean {
  return candidate === hostname || candidate.endsWith(`.${hostname}`);
}

function normalizeHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    const parsed = new URL(hasScheme ? trimmed : `http://${trimmed}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function httpHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function buildStartScope(startUrls: string[]): { hostnames: Set<string>; registrableDomains: Set<string> } {
  const hostnames = new Set<string>();
  const registrableDomains = new Set<string>();
  for (const url of startUrls) {
    const hostname = httpHostname(url);
    if (!hostname) {
      continue;
    }
    hostnames.add(hostname);
    const parsed = parse(hostname, { allowPrivateDomains: true });
    if (parsed.domain) {
      registrableDomains.add(parsed.domain.toLowerCase());
    }
  }
  return { hostnames, registrableDomains };
}

export function createScopeMatcher(startUrls: string[], scopeMode: ScopeMode, allowedDomains: string[]): ScopeMatcher {
  if (scopeMode === "anyDomain") {
    return () => true;
  }

  const startScope = buildStartScope(startUrls);

  if (scopeMode === "sameHostname") {
    return (url: string) => {
      const hostname = httpHostname(url);
      if (!hostname) {
        return false;
      }
      return startScope.hostnames.has(hostname);
    };
  }

  if (scopeMode === "customAllowlist") {
    const allowlist = new Set(
      allowedDomains
        .map((value) => normalizeHost(value))
        .filter((value): value is string => Boolean(value)),
    );
    return (url: string) => {
      const hostname = httpHostname(url);
      if (!hostname) {
        return false;
      }
      for (const allowed of allowlist) {
        if (isHostnameOrSubdomain(allowed, hostname)) {
          return true;
        }
      }
      return false;
    };
  }

  return (url: string) => {
    const hostname = httpHostname(url);
    if (!hostname) {
      return false;
    }
    if (startScope.hostnames.has(hostname)) {
      return true;
    }
    for (const domain of startScope.registrableDomains) {
      if (isHostnameOrSubdomain(domain, hostname)) {
        return true;
      }
    }
    return false;
  };
}
