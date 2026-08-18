// The Ferrosa AI design system must meet the contrast it claims.
//
// This is scripts/check-design-system-contrast.mjs applied to the company-level
// design system. Same arithmetic, same thresholds, same failure message. It is a
// separate file rather than a flag on the original because the two systems use
// different token prefixes (--fm- for Ferrosa Memory, --ferrosa- for Ferrosa AI)
// and the memory checker should keep guarding memory without gaining a mode.
//
// It covers two sources, because a token block that nothing checks is a token
// block that drifts:
//   docs/design-system.html  the design system page itself
//   theme/examples.css       the AsciiDoc theme the generated database examples
//                            use, which restates the same tokens for a stylesheet
//                            Asciidoctor links rather than a page
// Both declare --ferrosa-* tokens in the same three blocks (dark :root, explicit
// light, prefers-color-scheme light), so one parser reads both.
//
// Run: node scripts/check-brand-contrast.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const SOURCES = [
  ["design system", join(here, "..", "docs", "design-system.html")],
  ["examples theme", join(here, "..", "theme", "examples.css")],
  // The site stylesheet declares its own --* tokens (not --ferrosa-*) in the
  // same three blocks. It ships BOTH polarities, so both must be gated: a
  // light palette that is only eyeballed is a light palette that drifts.
  ["site stylesheet", join(here, "..", "docs", "site.css")],
];

function linear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Pull each theme's tokens from its own block, so a value fixed in one theme
// and missed in the other cannot pass. The light palette is declared twice —
// once for the explicit choice and once for prefers-color-scheme — and both
// are checked, because a user reaching light mode either way must get the same
// contrast.
function tokensIn(block, prefix) {
  const found = {};
  const re = prefix
    ? /--ferrosa-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g
    : /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g;
  for (const [, name, value] of block.matchAll(re)) found[name] = value.toLowerCase();
  return found;
}

// The two systems name the same roles differently. Map site.css onto the names
// the CHECKS table already uses, rather than duplicating the table.
const ALIAS = {
  "bg": "bg", "surface": "surface", "text": "text", "muted": "text-muted",
  "subtle": "text-subtle", "primary": "primary", "accent": "accent",
  "success": "success", "warning": "warning", "danger": "danger",
  "on-primary": "text-on-primary", "border": "border", "code-bg": "code-bg",
};
function normalise(tok, isSite) {
  if (!isSite) return tok;
  const out = {};
  for (const [k, v] of Object.entries(tok)) out[ALIAS[k] ?? k] = v;
  return out;
}

function themesIn(text, label) {
  const darkStart = text.indexOf(":root {");
  const lightStart = text.indexOf(':root[data-theme="light"]');
  const mediaStart = text.indexOf("@media (prefers-color-scheme: light)");

  // Every source must declare all three blocks. A source missing one would
  // otherwise be checked in the themes it has and pass silently in the one it
  // forgot — the exact drift this script exists to catch.
  if (darkStart < 0 || lightStart < 0 || mediaStart < 0) {
    console.error(
      `\n${label}: expected a dark :root block, a :root[data-theme="light"] ` +
        "block and a @media (prefers-color-scheme: light) block. " +
        "One or more is missing, so its palette cannot be checked.",
    );
    process.exit(1);
  }

  const isSite = label === "site stylesheet";
  const pick = (a, b) => normalise(tokensIn(text.slice(a, b), !isSite), isSite);
  return [
    ["dark", pick(darkStart, lightStart)],
    ["light (explicit)", pick(lightStart, mediaStart)],
    ["light (prefers-color-scheme)", pick(mediaStart, text.length)],
  ];
}

// [foreground token, background token, threshold, what it is]
const CHECKS = [
  ["text", "bg", 4.5, "body text"],
  ["text", "surface", 4.5, "body text on a surface"],
  ["text-muted", "surface", 4.5, "muted text"],
  ["text-subtle", "surface", 4.5, "subtle text"],
  ["text-subtle", "bg", 4.5, "subtle text on the page"],
  ["primary", "surface", 4.5, "primary as a link or label"],
  ["accent", "surface", 4.5, "accent as code or data"],
  ["success", "surface", 4.5, "status word"],
  ["warning", "surface", 4.5, "status word"],
  ["danger", "surface", 4.5, "status word"],
  ["text-on-primary", "primary", 4.5, "primary button label"],
  ["border", "surface", 3.0, "component boundary (1.4.11)"],
  ["border", "bg", 3.0, "component boundary (1.4.11)"],
  // Code is the whole point of the examples theme: syntax colours sit on the
  // code background, not on a surface, so they need their own pairs.
  ["text-muted", "code-bg", 4.5, "code text"],
  ["primary", "code-bg", 4.5, "keyword"],
  ["accent", "code-bg", 4.5, "identifier / inline code"],
  ["success", "code-bg", 4.5, "string literal"],
  ["warning", "code-bg", 4.5, "numeric literal"],
  ["danger", "code-bg", 4.5, "tag"],
  ["text-subtle", "code-bg", 4.5, "comment"],
  ["code-text", "code-bg", 4.5, "code body"],
  ["syn-kw", "code-bg", 4.5, "keyword"],
  ["syn-fn", "code-bg", 4.5, "identifier"],
  ["syn-str", "code-bg", 4.5, "string"],
  ["syn-num", "code-bg", 4.5, "number"],
  ["syn-attr", "code-bg", 4.5, "attribute"],
  ["syn-op", "code-bg", 4.5, "operator"],
  ["syn-com", "code-bg", 4.5, "code comment"],
];

let failures = 0;
let checked = 0;

for (const [sourceLabel, path] of SOURCES) {
  const text = readFileSync(path, "utf8");
  console.log(`\n=== ${sourceLabel} ===`);

  for (const [themeName, tokens] of themesIn(text, sourceLabel)) {
    console.log(`\n${themeName}`);
    for (const [fgName, bgName, threshold, what] of CHECKS) {
      const fg = tokens[fgName];
      const bg = tokens[bgName];
      // A theme block legitimately omits tokens it inherits from :root, and a
      // source legitimately omits tokens it has no use for. Skipping is
      // correct; silently passing a missing token would not be.
      if (!fg || !bg) continue;
      checked += 1;
      const r = ratio(fg, bg);
      const ok = r >= threshold;
      if (!ok) failures += 1;
      console.log(
        `  ${ok ? "ok  " : "FAIL"} --ferrosa-${fgName} on --ferrosa-${bgName}  ` +
          `${r.toFixed(2)}:1 (needs ${threshold.toFixed(1)} — ${what})`,
      );
    }
  }
}

console.log(`\n${checked} combinations checked, ${failures} below AA.`);

if (failures > 0) {
  console.error(
    "\nThe page claims AA in both themes. Fix the token or drop the claim —\n" +
      "shipping a palette that fails the standard it advertises is worse than\n" +
      "not advertising it.",
  );
  process.exit(1);
}
