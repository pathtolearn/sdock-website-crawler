import { describe, expect, it } from "vitest";

import { createScopeMatcher } from "../src/scope";

describe("createScopeMatcher", () => {
  it("allows same registrable domain and subdomains by default mode", () => {
    const matcher = createScopeMatcher(["https://www.kitaabh.com"], "sameDomainSubdomains", []);
    expect(matcher("https://kitaabh.com/about")).toBe(true);
    expect(matcher("https://blog.kitaabh.com/post")).toBe(true);
    expect(matcher("https://google.com")).toBe(false);
  });

  it("restricts to exact host for sameHostname mode", () => {
    const matcher = createScopeMatcher(["https://www.example.com"], "sameHostname", []);
    expect(matcher("https://www.example.com/docs")).toBe(true);
    expect(matcher("https://blog.example.com/docs")).toBe(false);
  });

  it("allows all domains for anyDomain mode", () => {
    const matcher = createScopeMatcher(["https://www.example.com"], "anyDomain", []);
    expect(matcher("https://google.com")).toBe(true);
  });

  it("uses custom allowlist entries and subdomains", () => {
    const matcher = createScopeMatcher(["https://www.example.com"], "customAllowlist", ["cdn.example.net", "images.example.com"]);
    expect(matcher("https://cdn.example.net/a.png")).toBe(true);
    expect(matcher("https://sub.cdn.example.net/a.png")).toBe(true);
    expect(matcher("https://images.example.com/a.png")).toBe(true);
    expect(matcher("https://example.com")).toBe(false);
  });

  it("supports multiple start URL scopes", () => {
    const matcher = createScopeMatcher(["https://docs.example.com", "https://news.example.org"], "sameDomainSubdomains", []);
    expect(matcher("https://api.example.com")).toBe(true);
    expect(matcher("https://media.example.org")).toBe(true);
    expect(matcher("https://example.net")).toBe(false);
  });
});
