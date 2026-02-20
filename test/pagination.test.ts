import { describe, expect, it } from "vitest";

import { discoverLinks, normalizeLink } from "../src/pagination";
import { createScopeMatcher } from "../src/scope";

describe("pagination", () => {
  it("normalizes links and removes hash fragments", () => {
    const link = normalizeLink("https://example.com/base", "/a#section");
    expect(link).toBe("https://example.com/a");
  });

  it("discovers links with include and exclude globs", () => {
    const matcher = createScopeMatcher(["https://example.com"], "sameDomainSubdomains", []);
    const html = `
      <a href="/blog/page/1">Page 1</a>
      <a href="/blog/page/2">Next</a>
      <a href="/private/secret">Secret</a>
      <a href="https://google.com/search">Google</a>
      <a href="mailto:test@example.com">Mail</a>
    `;
    const links = discoverLinks(html, "https://example.com", ["https://example.com/blog/*"], ["*secret*"], matcher);

    expect(links.map((link) => link.url)).toEqual([
      "https://example.com/blog/page/1",
      "https://example.com/blog/page/2",
    ]);
    expect(links[1]?.priority).toBe(80);
  });
});
