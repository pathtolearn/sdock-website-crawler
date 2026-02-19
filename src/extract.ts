import { load, CheerioAPI } from "cheerio";
import TurndownService from "turndown";

import type { HtmlTransformer } from "./input";

export type ExtractionOptions = {
  removeCookieWarnings: boolean;
  removeNavigationElements: boolean;
  removeCssSelectors: string[];
  keepCssSelectors: string[];
  htmlTransformer: HtmlTransformer;
};

export type ExtractedContent = {
  title: string | null;
  description: string | null;
  content_text: string | null;
  content_markdown: string | null;
  links: string[];
  language: string | null;
  cleaned_html: string;
  metadata: Record<string, unknown>;
};

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

function compactText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function removeCookieElements($: CheerioAPI): void {
  const selectors = [
    "[id*='cookie']",
    "[class*='cookie']",
    "[data-testid*='cookie']",
    "[aria-label*='cookie' i]",
    "[id*='consent']",
    "[class*='consent']",
  ];
  $(selectors.join(",")).remove();
}

function applyKeepSelectors($: CheerioAPI, keepSelectors: string[]): void {
  if (keepSelectors.length === 0) {
    return;
  }
  const fragments: string[] = [];
  for (const selector of keepSelectors) {
    try {
      const html = $(selector)
        .map((_index, element) => $.html(element))
        .get()
        .join("\n");
      if (html.trim()) {
        fragments.push(html);
      }
    } catch {
      continue;
    }
  }
  if (fragments.length > 0) {
    const isolated = load(`<html><body>${fragments.join("\n")}</body></html>`);
    $("body").replaceWith(isolated("body").clone());
  }
}

function computeMarkdown($: CheerioAPI, transformer: HtmlTransformer): string | null {
  if (transformer === "none") {
    return null;
  }
  let sourceHtml = $("body").html() || "";
  if (transformer === "readable") {
    sourceHtml = $("main").first().html() || $("article").first().html() || sourceHtml;
  }
  const markdown = sourceHtml ? turndown.turndown(sourceHtml).trim() : "";
  return markdown || null;
}

export function extractContent(html: string, pageUrl: string, finalUrl: string, options: ExtractionOptions): ExtractedContent {
  const $ = load(html);
  const title = compactText($("title").first().text() || "") || null;
  const description = $("meta[name='description']").attr("content")?.trim() || null;
  const language = $("html").attr("lang")?.trim() || null;

  if (options.removeCookieWarnings) {
    removeCookieElements($);
  }
  if (options.removeNavigationElements) {
    $("header,footer,nav,aside").remove();
  }

  for (const selector of options.removeCssSelectors) {
    try {
      $(selector).remove();
    } catch {
      continue;
    }
  }

  applyKeepSelectors($, options.keepCssSelectors);

  const links = $("a[href]")
    .map((_index, element) => $(element).attr("href") || "")
    .get()
    .map((href) => href.trim())
    .filter(Boolean)
    .slice(0, 1000);

  $("script,style,noscript,iframe,svg,canvas").remove();

  const cleanedHtml = $("body").html() || "";
  const contentText = compactText($("body").text() || "") || null;
  const contentMarkdown = computeMarkdown($, options.htmlTransformer);

  return {
    title,
    description,
    content_text: contentText,
    content_markdown: contentMarkdown,
    links,
    language,
    cleaned_html: cleanedHtml,
    metadata: {
      source_url: pageUrl,
      final_url: finalUrl,
      extractor: "website-content-crawler",
      extracted_links: links.length,
      html_transformer: options.htmlTransformer,
    },
  };
}
