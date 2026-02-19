import { describe, expect, it } from "vitest";

import { extractContent } from "../src/extract";

describe("extractContent", () => {
  it("extracts cleaned content and markdown", () => {
    const html = `
      <html lang="en">
        <head>
          <title>Example title</title>
          <meta name="description" content="Example description" />
        </head>
        <body>
          <header>Top nav</header>
          <main>
            <h1>Hello</h1>
            <p>World</p>
          </main>
          <script>ignored()</script>
          <a href="https://example.com/next">next</a>
        </body>
      </html>
    `;

    const extracted = extractContent(html, "https://example.com", "https://example.com", {
      removeCookieWarnings: true,
      removeNavigationElements: true,
      removeCssSelectors: [],
      keepCssSelectors: [],
      htmlTransformer: "markdown",
    });

    expect(extracted.title).toBe("Example title");
    expect(extracted.description).toBe("Example description");
    expect(extracted.content_text).toContain("Hello");
    expect(extracted.content_markdown).toContain("# Hello");
    expect(extracted.links).toEqual(["https://example.com/next"]);
    expect(extracted.cleaned_html).not.toContain("script");
    expect(extracted.cleaned_html).not.toContain("Top nav");
  });

  it("supports keepCssSelectors", () => {
    const html = `
      <body>
        <div class="content">keep me</div>
        <div class="ads">drop me</div>
      </body>
    `;

    const extracted = extractContent(html, "https://example.com", "https://example.com", {
      removeCookieWarnings: false,
      removeNavigationElements: false,
      removeCssSelectors: [],
      keepCssSelectors: [".content"],
      htmlTransformer: "none",
    });

    expect(extracted.content_text).toContain("keep me");
    expect(extracted.content_text).not.toContain("drop me");
    expect(extracted.content_markdown).toBeNull();
  });
});
