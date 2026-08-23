#!/usr/bin/env node
// Find dead vertical space — bands of page height where nothing is painted.
//
// Why not measure element boxes: a DOM audit reports an inline element that
// wraps across lines as spanning every line it touches, and a block container
// reports its full height whether or not anything inside it paints. That
// approach produced dozens of false positives and missed the real gaps.
//
// This samples POINTS instead. It walks a grid down the page with
// elementFromPoint and calls a row empty when every sample lands on a container
// with no painted leaf — no text node, no image/svg/canvas, no border or
// non-transparent background of its own. Runs of empty rows are the bands.
//
// Usage: node find-empty-bands.mjs design.config.json [--threshold 200]
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error("usage: find-empty-bands.mjs <design.config.json> [--threshold px]");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const root = dirname(resolve(cfgPath));
const docRoot = resolve(root, cfg.docRoot ?? ".");

const tArg = process.argv.indexOf("--threshold");
const THRESHOLD = tArg > -1 ? Number(process.argv[tArg + 1]) : (cfg.whitespaceThreshold ?? 200);
const viewport = cfg.viewports?.[0] ?? "1440x900";

const CHROME = [cfg.chrome,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!CHROME) {
  console.error('No Chrome binary found. Set "chrome" in the config to its path.');
  process.exit(2);
}

const PROBE = `<script>(function(){
function scan(){
var W=document.documentElement.clientWidth, H=document.documentElement.scrollHeight;
var STEP=4, COLS=24;
function painted(el){
  if(!el||el===document.body||el===document.documentElement) return false;
  var cs=getComputedStyle(el);
  if(cs.visibility==="hidden"||cs.opacity==="0") return false;
  var tag=el.tagName.toLowerCase();
  if(tag==="img"||tag==="svg"||tag==="canvas"||tag==="video"||tag==="hr"||tag==="input"||tag==="button") return true;
  if(cs.backgroundImage&&cs.backgroundImage!=="none") return true;
  var bw=["borderTopWidth","borderBottomWidth","borderLeftWidth","borderRightWidth"].some(function(p){return parseFloat(cs[p])>0;});
  if(bw) return true;
  // A direct text node with actual glyphs is the common case.
  for(var i=0;i<el.childNodes.length;i++){
    var n=el.childNodes[i];
    if(n.nodeType===3&&n.textContent.trim().length) return true;
  }
  return false;
}
var rows=[];
for(var y=0;y<H;y+=STEP){
  var vy=y-window.scrollY, hit=false;
  if(vy<0||vy>=window.innerHeight){ window.scrollTo(0,Math.max(0,y-Math.floor(window.innerHeight/2))); vy=y-window.scrollY; }
  for(var c=0;c<COLS;c++){
    var x=Math.round((c+0.5)*W/COLS);
    var el=document.elementFromPoint(x,vy);
    if(painted(el)){hit=true;break;}
  }
  rows.push(hit?1:0);
}
var bands=[],start=null;
for(var i=0;i<rows.length;i++){
  if(!rows[i]&&start===null) start=i;
  if(rows[i]&&start!==null){ bands.push([start*STEP,i*STEP]); start=null; }
}
if(start!==null) bands.push([start*STEP,rows.length*STEP]);
document.title="__BANDS__"+JSON.stringify({height:H,bands:bands});
}
// See measure-anatomy.mjs: report on load, refine after fonts settle. A nested
// requestAnimationFrame is not reliably reached under --virtual-time-budget.
window.addEventListener("load",function(){
  scan();
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(scan);}
});
})();</script>`;

let failures = 0;
for (const page of cfg.pages) {
  const src = resolve(docRoot, page.replace(/^\//, ""));
  if (!existsSync(src)) { console.error(`  ${page}: no such file`); failures += 1; continue; }
  const shadow = src.replace(/([^/]+)$/, "__bands_$1");
  copyFileSync(src, shadow);
  const t = readFileSync(shadow, "utf8");
  writeFileSync(shadow, t.includes("</body>") ? t.replace("</body>", `${PROBE}</body>`) : t + PROBE);

  let dom;
  try {
    dom = execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
      `--window-size=${viewport.replace("x", ",")}`,
      "--virtual-time-budget=9000", "--dump-dom",
      `${cfg.baseUrl.replace(/\/$/, "")}/${relative(docRoot, shadow)}`,
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } finally {
    try { unlinkSync(shadow); } catch { /* already gone */ }
  }

  const m = dom.match(/<title>__BANDS__(.*?)<\/title>/s);
  if (!m) { console.error(`  ${page}: probe did not report`); failures += 1; continue; }
  const { height, bands } = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  // The band that runs to the bottom of the document is the page end, not a gap.
  const real = bands
    .map(([a, b]) => ({ from: a, to: b, size: b - a }))
    .filter((b) => b.size >= THRESHOLD && b.to < height - 8);
  console.log(`  ${real.length ? "FAIL" : "ok  "} ${page}  (${height}px tall)`);
  for (const b of real) console.log(`         ${b.size}px empty at y=${b.from}–${b.to}`);
  if (real.length) failures += 1;
}

console.log(failures === 0
  ? `\nno empty band over ${THRESHOLD}px`
  : `\n${failures} page(s) with dead vertical space`);
process.exit(failures === 0 ? 0 : 1);
