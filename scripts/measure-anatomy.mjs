#!/usr/bin/env node
// Assert that a shared component computes IDENTICALLY across the pages that
// share it — the gate that catches "this page feels off".
//
// It measures COMPUTED STYLE in a real browser, not source CSS. That is the
// whole point: the 64px Forge hero was correct in every rule you could read and
// wrong only in which rule won. Specificity ties, ported bare-element selectors
// and cascade order are invisible to a stylesheet audit and obvious here.
//
// Drives headless Chrome directly. No npm install, no puppeteer.
//
// Usage: node measure-anatomy.mjs design.config.json [--viewport 1440x900]
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error("usage: measure-anatomy.mjs <design.config.json> [--viewport WxH]");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const root = dirname(resolve(cfgPath));
const docRoot = resolve(root, cfg.docRoot ?? ".");

const vpArg = process.argv.indexOf("--viewport");
const viewports = vpArg > -1 ? [process.argv[vpArg + 1]] : (cfg.viewports ?? ["1440x900"]);

const CHROME = [cfg.chrome,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!CHROME) {
  console.error('No Chrome binary found. Set "chrome" in the config to its path.');
  process.exit(2);
}

const rules = cfg.uniform ?? [];
if (!rules.length) {
  console.error('Config has no "uniform" rules — nothing to assert.');
  process.exit(2);
}

// The probe runs inside the page, so it is appended to a shadow copy written
// beside the original. Same directory keeps every relative URL working.
function shadowOf(page, applicable) {
  const src = resolve(docRoot, page.replace(/^\//, ""));
  if (!existsSync(src)) {
    console.error(`  ${page}: no such file (${src}). Check "pages" and "docRoot".`);
    return null;
  }
  const shadow = src.replace(/([^/]+)$/, "__anatomy_$1");
  copyFileSync(src, shadow);
  // Report on `load`, then again once web fonts settle. Do NOT gate the only
  // report on requestAnimationFrame: under --virtual-time-budget a nested rAF
  // frequently never runs before the DOM is dumped, and the probe silently
  // reports nothing on some pages and not others.
  const inject = `<script>(function(){
var RULES=${JSON.stringify(applicable)};
function report(){
  var out={};
  RULES.forEach(function(rule){
    out[rule.name]=Array.prototype.slice.call(document.querySelectorAll(rule.selector)).map(function(el){
      var cs=getComputedStyle(el),r=el.getBoundingClientRect(),o={};
      rule.properties.forEach(function(p){o[p]=cs[p];});
      o.box=Math.round(r.width)+"x"+Math.round(r.height);return o;});});
  document.title="__PROBE__"+JSON.stringify(out);
}
window.addEventListener("load",function(){
  report();
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(report);}
});
})();</script>`;
  const t = readFileSync(shadow, "utf8");
  writeFileSync(shadow, t.includes("</body>") ? t.replace("</body>", `${inject}</body>`) : t + inject);
  return shadow;
}

function measure(shadow, viewport) {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/${relative(docRoot, shadow)}`;
  const dom = execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--window-size=${viewport.replace("x", ",")}`,
    "--virtual-time-budget=8000", "--dump-dom", url,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  const m = dom.match(/<title>__PROBE__(.*?)<\/title>/s);
  if (!m) return null;
  const decoded = m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d));
  return JSON.parse(decoded);
}

let failures = 0;
for (const viewport of viewports) {
  console.log(`\n=== viewport ${viewport} ===`);
  const collected = new Map(rules.map((r) => [r.name, new Map()]));

  for (const page of cfg.pages) {
    const applicable = rules.filter((r) => !r.pages || r.pages.includes(page));
    if (!applicable.length) continue;
    const shadow = shadowOf(page, applicable);
    if (!shadow) { failures += 1; continue; }
    let data;
    try {
      data = measure(shadow, viewport);
    } finally {
      try { unlinkSync(shadow); } catch { /* already gone */ }
    }
    if (!data) {
      console.error(`  ${page}: probe did not report — is ${cfg.baseUrl} serving ${cfg.docRoot ?? "."}?`);
      failures += 1;
      continue;
    }
    for (const [name, vals] of Object.entries(data)) collected.get(name).set(page, vals);
  }

  for (const rule of rules) {
    const perPage = collected.get(rule.name);
    if (!perPage.size) continue;
    const groups = new Map();
    for (const [page, vals] of perPage) {
      if (rule.expectCount != null && vals.length !== rule.expectCount) {
        console.log(`  FAIL ${rule.name}: ${page} matched ${vals.length}, expected ${rule.expectCount}`);
        failures += 1;
      }
      for (const v of vals) {
        const sig = rule.properties.map((p) => `${p}=${v[p]}`).join("  ")
          + (rule.uniformBox ? `  box=${v.box}` : "");
        if (!groups.has(sig)) groups.set(sig, []);
        groups.get(sig).push(page);
      }
    }
    const ok = groups.size <= 1;
    if (!ok) failures += 1;
    console.log(`\n  ${ok ? "ok  " : "FAIL"} ${rule.name} — ${groups.size} distinct computed style(s)`);
    for (const [sig, pages] of groups) {
      const uniq = [...new Set(pages)];
      console.log(`       ${sig}`);
      console.log(`         on ${uniq.length} page(s): ${uniq.join(", ")}`);
    }
  }
}

console.log(failures === 0 ? "\nanatomy consistent" : `\n${failures} anatomy failure(s)`);
process.exit(failures === 0 ? 0 : 1);
