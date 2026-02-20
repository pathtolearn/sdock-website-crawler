import { load, CheerioAPI } from "cheerio";
import TurndownService from "turndown";

import type { HtmlTransformer } from "./input";

const IMAGE_FILE_RE = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)(?:[?#]|$)/i;
const AUDIO_FILE_RE = /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)(?:[?#]|$)/i;
const VIDEO_FILE_RE = /\.(?:m3u8|m4v|mov|mp4|mpeg|mpg|ogv|webm)(?:[?#]|$)/i;

export type MediaLinks = {
  images: string[];
  audio: string[];
  video: string[];
  counts: {
    images: number;
    audio: number;
    video: number;
  };
};

export type ExtractionOptions = {
  removeCookieWarnings: boolean;
  removeNavigationElements: boolean;
  removeCssSelectors: string[];
  keepCssSelectors: string[];
  htmlTransformer: HtmlTransformer;
  includeImageLinks: boolean;
  includeAudioLinks: boolean;
  includeVideoLinks: boolean;
  isInScope: (url: string) => boolean;
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

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAbsoluteUrl(baseUrl: string, raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const lower = value.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("data:") ||
    lower.startsWith("#")
  ) {
    return null;
  }
  try {
    const resolved = new URL(value, baseUrl);
    resolved.hash = "";
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

function parseSrcset(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0] || "")
    .filter(Boolean);
}

function readAttr($: CheerioAPI, selector: string, attr: string): string[] {
  return $(selector)
    .map((_index, element) => $(element).attr(attr) || "")
    .get()
    .map((value) => value.trim())
    .filter(Boolean);
}

function collectMediaLinks($: CheerioAPI, finalUrl: string, options: ExtractionOptions): MediaLinks {
  const imageSet = new Set<string>();
  const audioSet = new Set<string>();
  const videoSet = new Set<string>();

  const pushTarget = (target: Set<string>, raw: string): void => {
    const normalized = normalizeAbsoluteUrl(finalUrl, raw);
    if (!normalized || !isHttpUrl(normalized) || !options.isInScope(normalized)) {
      return;
    }
    target.add(normalized);
  };

  if (options.includeImageLinks) {
    for (const value of readAttr($, "img[src], picture img[src], source[src], meta[property='og:image'][content], meta[name='twitter:image'][content], link[rel='image_src'][href]", "src")) {
      pushTarget(imageSet, value);
    }
    for (const value of readAttr($, "meta[property='og:image'][content], meta[name='twitter:image'][content]", "content")) {
      pushTarget(imageSet, value);
    }
    for (const value of readAttr($, "link[rel='image_src'][href]", "href")) {
      pushTarget(imageSet, value);
    }
    for (const srcset of readAttr($, "img[srcset], source[srcset], picture source[srcset]", "srcset")) {
      for (const entry of parseSrcset(srcset)) {
        pushTarget(imageSet, entry);
      }
    }
    for (const href of readAttr($, "a[href]", "href")) {
      const normalized = normalizeAbsoluteUrl(finalUrl, href);
      if (normalized && IMAGE_FILE_RE.test(normalized)) {
        pushTarget(imageSet, normalized);
      }
    }
  }

  if (options.includeAudioLinks) {
    for (const value of readAttr($, "audio[src], audio source[src], source[type^='audio/'][src], meta[property='og:audio'][content]", "src")) {
      pushTarget(audioSet, value);
    }
    for (const value of readAttr($, "meta[property='og:audio'][content]", "content")) {
      pushTarget(audioSet, value);
    }
    for (const href of readAttr($, "a[href]", "href")) {
      const normalized = normalizeAbsoluteUrl(finalUrl, href);
      if (normalized && AUDIO_FILE_RE.test(normalized)) {
        pushTarget(audioSet, normalized);
      }
    }
  }

  if (options.includeVideoLinks) {
    for (const value of readAttr($, "video[src], video source[src], source[type^='video/'][src], meta[property='og:video'][content]", "src")) {
      pushTarget(videoSet, value);
    }
    for (const value of readAttr($, "meta[property='og:video'][content]", "content")) {
      pushTarget(videoSet, value);
    }
    for (const href of readAttr($, "a[href]", "href")) {
      const normalized = normalizeAbsoluteUrl(finalUrl, href);
      if (normalized && VIDEO_FILE_RE.test(normalized)) {
        pushTarget(videoSet, normalized);
      }
    }
  }

  const images = [...imageSet].slice(0, 1000);
  const audio = [...audioSet].slice(0, 1000);
  const video = [...videoSet].slice(0, 1000);
  return {
    images,
    audio,
    video,
    counts: {
      images: images.length,
      audio: audio.length,
      video: video.length,
    },
  };
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
  const mediaLinks = collectMediaLinks($, finalUrl, options);

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
      media_links: mediaLinks,
    },
  };
}
