import { describe, expect, it } from "vitest";

import { parseRuntimeInput } from "../src/input";

describe("parseRuntimeInput", () => {
  it("parses valid payload and applies defaults", () => {
    const parsed = parseRuntimeInput({
      startUrls: ["https://example.com"],
    });

    expect(parsed.startUrls).toEqual(["https://example.com/"]);
    expect(parsed.crawlerType).toBe("camoufox");
    expect(parsed.scopeMode).toBe("sameDomainSubdomains");
    expect(parsed.allowedDomains).toEqual([]);
    expect(parsed.maxDepth).toBe(20);
    expect(parsed.maxPages).toBe(500);
    expect(parsed.maxRuntimeSeconds).toBe(1800);
    expect(parsed.maxIdleCycles).toBe(5);
    expect(parsed.saveMarkdown).toBe(true);
    expect(parsed.includeImageLinks).toBe(true);
    expect(parsed.includeAudioLinks).toBe(true);
    expect(parsed.includeVideoLinks).toBe(true);
  });

  it("ignores unknown fields for backward compatibility", () => {
    const parsed = parseRuntimeInput({
      startUrls: ["https://example.com"],
      madeUpField: true,
    });
    expect(parsed.startUrls).toEqual(["https://example.com/"]);
  });

  it("accepts legacy crawler type alias", () => {
    const parsed = parseRuntimeInput({
      startUrls: ["https://example.com"],
      crawlerType: "playwright:adaptive",
    });
    expect(parsed.crawlerType).toBe("playwright");
  });

  it("accepts legacy maxCrawlDepth alias", () => {
    const parsed = parseRuntimeInput({
      startUrls: ["https://example.com"],
      maxCrawlDepth: 7,
    });
    expect(parsed.maxDepth).toBe(7);
  });

  it("rejects invalid URL", () => {
    expect(() => parseRuntimeInput({ startUrls: ["notaurl"] })).toThrow("Invalid URL");
  });

  it("rejects invalid ranges", () => {
    expect(() =>
      parseRuntimeInput({
        startUrls: ["https://example.com"],
        maxDepth: 1000,
      }),
    ).toThrow("maxDepth");
  });

  it("requires allowedDomains when customAllowlist scope is used", () => {
    expect(() =>
      parseRuntimeInput({
        startUrls: ["https://example.com"],
        scopeMode: "customAllowlist",
      }),
    ).toThrow("allowedDomains");
  });

  it("normalizes and deduplicates allowedDomains", () => {
    const parsed = parseRuntimeInput({
      startUrls: ["https://example.com"],
      scopeMode: "customAllowlist",
      allowedDomains: ["https://EXAMPLE.com", "example.com"],
    });
    expect(parsed.allowedDomains).toEqual(["example.com"]);
  });
});
