import { describe, expect, it } from "vitest";

import { extractContent } from "../src/extract";
import { createScopeMatcher } from "../src/scope";

describe("extractContent", () => {
  it("extracts cleaned content and markdown", () => {
    const scopeMatcher = createScopeMatcher(["https://example.com"], "sameDomainSubdomains", []);
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
      includeImageLinks: true,
      includeAudioLinks: true,
      includeVideoLinks: true,
      isInScope: scopeMatcher,
    });

    expect(extracted.title).toBe("Example title");
    expect(extracted.description).toBe("Example description");
    expect(extracted.content_text).toContain("Hello");
    expect(extracted.content_markdown).toContain("# Hello");
    expect(extracted.links).toEqual(["https://example.com/next"]);
    expect(extracted.cleaned_html).not.toContain("script");
    expect(extracted.cleaned_html).not.toContain("Top nav");
    expect(extracted.metadata.media_links).toEqual({
      images: [],
      audio: [],
      video: [],
      counts: { images: 0, audio: 0, video: 0 },
    });
  });

  it("supports keepCssSelectors", () => {
    const scopeMatcher = createScopeMatcher(["https://example.com"], "sameDomainSubdomains", []);
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
      includeImageLinks: true,
      includeAudioLinks: true,
      includeVideoLinks: true,
      isInScope: scopeMatcher,
    });

    expect(extracted.content_text).toContain("keep me");
    expect(extracted.content_text).not.toContain("drop me");
    expect(extracted.content_markdown).toBeNull();
  });

  it("extracts media links based on toggles and scope", () => {
    const scopeMatcher = createScopeMatcher(["https://example.com"], "sameDomainSubdomains", []);
    const html = `
      <body>
        <img src="/img/a.jpg" />
        <img src="https://cdn.example.com/assets/b.webp" />
        <audio src="/audio/intro.mp3"></audio>
        <video src="https://example.com/video/demo.mp4"></video>
        <a href="https://example.com/video/clip.webm">clip</a>
        <a href="https://google.com/video/external.mp4">external</a>
      </body>
    `;

    const extracted = extractContent(html, "https://example.com", "https://example.com/page", {
      removeCookieWarnings: false,
      removeNavigationElements: false,
      removeCssSelectors: [],
      keepCssSelectors: [],
      htmlTransformer: "none",
      includeImageLinks: true,
      includeAudioLinks: false,
      includeVideoLinks: true,
      isInScope: scopeMatcher,
    });

    expect(extracted.metadata.media_links).toEqual({
      images: ["https://example.com/img/a.jpg", "https://cdn.example.com/assets/b.webp"],
      audio: [],
      video: ["https://example.com/video/demo.mp4", "https://example.com/video/clip.webm"],
      counts: { images: 2, audio: 0, video: 2 },
    });
  });
});
