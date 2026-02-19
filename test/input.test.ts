import { describe, expect, it } from "vitest";

import { InputValidationError, parseRuntimeInput } from "../src/input";

describe("parseRuntimeInput", () => {
  it("parses valid payload and applies defaults", () => {
    const parsed = parseRuntimeInput({
      startUrls: ["https://example.com"],
    });

    expect(parsed.startUrls).toEqual(["https://example.com/"]);
    expect(parsed.crawlerType).toBe("camoufox");
    expect(parsed.maxDepth).toBe(20);
    expect(parsed.maxPages).toBe(500);
    expect(parsed.saveMarkdown).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseRuntimeInput({
        startUrls: ["https://example.com"],
        madeUpField: true,
      }),
    ).toThrow(InputValidationError);
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
});
