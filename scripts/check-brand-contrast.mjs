// The Ferrosa AI design system must meet the contrast it claims.
//
// This is scripts/check-design-system-contrast.mjs applied to the company-level
// design system. Same arithmetic, same thresholds, same failure message. It is a
// separate file rather than a flag on the original because the two systems use
// different token prefixes (--fm- for Ferrosa Memory, --ferrosa- for Ferrosa AI)
// and the memory checker should keep guarding memory without gaining a mode.
//
// Run: node scripts/check-brand-contrast.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  join(here, "..", "docs", "design-system.html"),
  "utf8",
);

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
function tokensIn(block) {
  const found = {};
  for (const [, name, value] of block.matchAll(/--ferrosa-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    found[name] = value.toLowerCase();
  }
  return found;
}

const darkBlock = html.slice(html.indexOf(":root {"), html.indexOf('[data-theme="light"]'));
const lightExplicit = html.slice(
  html.indexOf(':root[data-theme="light"]'),
  html.indexOf("@media (prefers-color-scheme: light)"),
);
const lightMedia = html.slice(html.indexOf("@media (prefers-color-scheme: light)"));

const themes = [
  ["dark", tokensIn(darkBlock)],
  ["light (explicit)", tokensIn(lightExplicit)],
  ["light (prefers-color-scheme)", tokensIn(lightMedia)],
];

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
];

let failures = 0;
let checked = 0;

for (const [themeName, tokens] of themes) {
  console.log(`\n${themeName}`);
  for (const [fgName, bgName, threshold, what] of CHECKS) {
    const fg = tokens[fgName];
    const bg = tokens[bgName];
    // A theme block legitimately omits tokens it inherits from :root. Skipping
    // is correct; silently passing a missing token would not be.
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

console.log(`\n${checked} combinations checked, ${failures} below AA.`);

if (failures > 0) {
  console.error(
    "\nThe page claims AA in both themes. Fix the token or drop the claim —\n" +
      "shipping a palette that fails the standard it advertises is worse than\n" +
      "not advertising it.",
  );
  process.exit(1);
}
