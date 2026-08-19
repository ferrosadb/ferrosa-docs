#!/usr/bin/env node
// Gate a design system's token palette against WCAG 2.1, in EVERY theme it ships.
//
// Generalised from ferrosa-docs/scripts/check-brand-contrast.mjs. It reads a
// config rather than hard-coding one site's token names, so it runs against any
// repo whose colours are CSS custom properties.
//
// Fail-loud contract (skills/rules/safety.md):
//   - a source missing one of its declared theme blocks is an ERROR, not a skip
//     (checking the two it has and passing on the third is the exact drift this
//     exists to catch)
//   - token pairs that cannot be resolved are COUNTED and LISTED, never dropped
//     silently
//
// Usage: node check-contrast.mjs design.config.json
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error("usage: check-contrast.mjs <design.config.json>");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const root = dirname(resolve(cfgPath));

const linear = (c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lum = (hex) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? [...h].map((x) => x + x) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  const [r, g, b] = v.map((p) => parseInt(p, 16));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};
const ratio = (fg, bg) => {
  const [a, b] = [lum(fg), lum(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// Themes are identified by the CSS selector that opens their block. Each block
// runs to the start of the next one, so a token redefined per theme is read
// from its own theme.
const themeSelectors = cfg.themes ?? [
  { name: "dark", open: ":root {" },
  { name: "light (explicit)", open: ':root[data-theme="light"]' },
  { name: "light (prefers-color-scheme)", open: "@media (prefers-color-scheme: light)" },
];

// Comments are stripped before locating blocks. A stylesheet that DOCUMENTS its
// theme selectors in a header comment — as a good one does — otherwise has those
// mentions found first, and every block after it is sliced from the wrong offset.
// That silently empties the first block and skips every pair in it.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

function blocksFor(raw, label) {
  const text = stripComments(raw);
  const marks = themeSelectors.map((t) => ({ ...t, at: text.indexOf(t.open) }));
  const missing = marks.filter((m) => m.at < 0);
  if (missing.length) {
    console.error(
      `\n${label}: missing theme block(s) ${missing.map((m) => `"${m.open}"`).join(", ")}.\n` +
        "A palette that is only declared in some themes cannot be checked in the rest.\n" +
        "Declare the block, or drop the theme from the config — do not ship it unchecked.",
    );
    process.exit(1);
  }
  const ordered = [...marks].sort((a, b) => a.at - b.at);
  return ordered.map((m, i) => [m.name, text.slice(m.at, ordered[i + 1]?.at ?? text.length)]);
}

// Resolve `--name: #hex`, and one level of `--name: var(--other)` aliasing,
// which real stylesheets use constantly.
function tokensIn(block, prefix) {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = new RegExp(`--${esc}([a-z0-9-]+):\\s*(#[0-9a-fA-F]{3,8})`, "g");
  const alias = new RegExp(`--${esc}([a-z0-9-]+):\\s*var\\(\\s*--${esc}([a-z0-9-]+)`, "g");
  const out = {};
  for (const [, k, v] of block.matchAll(direct)) out[k] = v.slice(0, 7).toLowerCase();
  for (const [, k, ref] of block.matchAll(alias)) if (!out[k] && out[ref]) out[k] = out[ref];
  return out;
}

const applyAlias = (tok, map) => {
  if (!map) return tok;
  const out = {};
  for (const [k, v] of Object.entries(tok)) out[map[k] ?? k] = v;
  return out;
};

let checked = 0, failures = 0;
const unresolved = [];

for (const src of cfg.tokenSources) {
  const text = readFileSync(resolve(root, src.path), "utf8");
  console.log(`\n=== ${src.label ?? src.path} ===`);
  for (const [theme, block] of blocksFor(text, src.label ?? src.path)) {
    const tokens = applyAlias(tokensIn(block, src.prefix ?? ""), src.alias);
    console.log(`\n${theme}`);
    for (const [fg, bg, threshold, what] of cfg.checks) {
      if (!tokens[fg] || !tokens[bg]) {
        // Legitimately absent (a theme inherits it, or this source has no use
        // for it) — but recorded and reported, never silently dropped.
        unresolved.push(`${src.label ?? src.path} / ${theme}: ${fg} on ${bg}`);
        continue;
      }
      checked += 1;
      const r = ratio(tokens[fg], tokens[bg]);
      const ok = r >= threshold;
      if (!ok) failures += 1;
      console.log(
        `  ${ok ? "ok  " : "FAIL"} --${fg} on --${bg}  ${r.toFixed(2)}:1 ` +
          `(needs ${threshold.toFixed(1)} — ${what})`,
      );
    }
  }
}

console.log(`\n${checked} combinations checked, ${failures} below AA.`);
if (unresolved.length) {
  console.log(`${unresolved.length} pair(s) not resolvable in their block (token inherited or unused):`);
  for (const u of unresolved.slice(0, 12)) console.log(`  - ${u}`);
  if (unresolved.length > 12) console.log(`  … ${unresolved.length - 12} more`);
}
if (failures > 0) {
  console.error(
    "\nThe system claims AA. Fix the token or drop the claim — shipping a palette\n" +
      "that fails the standard it advertises is worse than not advertising it.",
  );
  process.exit(1);
}
