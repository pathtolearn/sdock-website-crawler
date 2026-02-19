import fs from "node:fs";
import path from "node:path";

import Ajv from "ajv";
import addFormats from "ajv-formats";

import { selectEngine } from "../src/engine";
import { extractContent } from "../src/extract";
import { parseRuntimeInput } from "../src/input";
import { discoverLinks } from "../src/pagination";

const root = process.cwd();

function readJson(filePath: string): Record<string, unknown> {
  const absolute = path.join(root, filePath);
  return JSON.parse(fs.readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

function main(): void {
  const inputSchema = readJson("input.schema.json");
  const outputSchema = readJson("output.schema.json");
  const exampleInput = readJson("example.input.json");

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validateInput = ajv.compile(inputSchema);
  const inputOk = validateInput(exampleInput);
  if (!inputOk) {
    throw new Error(`example.input.json failed validation: ${JSON.stringify(validateInput.errors)}`);
  }

  const normalized = parseRuntimeInput(exampleInput);
  const engine = selectEngine(normalized.crawlerType, {
    STEALTHDOCK_CAMOUFOX_ENABLED: "0",
  });

  const html = `
    <html lang="en">
      <head><title>Smoke Test</title><meta name="description" content="Smoke" /></head>
      <body>
        <main>
          <h1>Smoke page</h1>
          <p>Testing extraction.</p>
          <a href="/next">Next</a>
        </main>
      </body>
    </html>
  `;

  const extracted = extractContent(html, "https://example.com", "https://example.com", {
    removeCookieWarnings: normalized.removeCookieWarnings,
    removeNavigationElements: normalized.removeNavigationElements,
    removeCssSelectors: normalized.removeCssSelectors,
    keepCssSelectors: normalized.keepCssSelectors,
    htmlTransformer: normalized.htmlTransformer,
  });

  const discovered = discoverLinks(html, "https://example.com", normalized.includeGlobs, normalized.excludeGlobs);

  const record = {
    url: "https://example.com",
    final_url: "https://example.com",
    status_code: 200,
    fetched_at: new Date().toISOString(),
    title: extracted.title,
    description: extracted.description,
    content_text: normalized.saveText ? extracted.content_text : null,
    content_markdown: normalized.saveMarkdown ? extracted.content_markdown : null,
    links: extracted.links,
    language: extracted.language,
    metadata: {
      ...extracted.metadata,
      selected_engine: engine.selected,
      discovered_count: discovered.length,
      html: normalized.saveHtml ? extracted.cleaned_html : undefined,
    },
  };

  const validateOutput = ajv.compile(outputSchema);
  const outputOk = validateOutput(record);
  if (!outputOk) {
    throw new Error(`Output record failed validation: ${JSON.stringify(validateOutput.errors)}`);
  }

  console.log("Smoke checks passed");
  console.log(`Engine resolution: requested=${engine.requested}, selected=${engine.selected}`);
  console.log(`Discovered links: ${discovered.length}`);
}

main();
