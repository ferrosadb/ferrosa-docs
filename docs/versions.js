/* Fill every version placeholder on the page from versions.json.
 *
 * No page on this site carries a version literal. Each one marks the spot with
 *
 *   <span class="fv" data-fv="ferrosa" data-fv-part="tag" hidden></span>
 *
 * and this script writes the number in at load. versions.json is regenerated on
 * every deploy by scripts/fetch-release-versions.sh, so a new public release
 * reaches the site without anyone editing a page.
 *
 *   data-fv         product key — "ferrosa" | "memory" | "forge"
 *   data-fv-part    "tag" (v0.19.1, default) | "version" (0.19.1) | "minor" (0.19)
 *   data-fv-prefix  literal text written before the number, e.g. "· "
 *   data-fv-suffix  literal text written after it
 *
 * Placeholders ship `hidden` and are revealed only once a real number is in
 * them. If the fetch fails the version is simply absent, and the surrounding
 * sentence still reads: no page ever shows a stale number, a blank, or a
 * dangling separator. The failure is reported to the console and stamped on
 * <html> as data-fv-state="error" so it is visible rather than silent.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var nodes = document.querySelectorAll("[data-fv]");
  if (!nodes.length) return;

  // Resolve against this script's own URL, not the page's: pages sit at /,
  // /database/, /ferrosa-memory/ and /forge/, and all of them load the same
  // versions.json next to the same versions.js.
  var url = new URL("versions.json", script ? script.src : document.baseURI);

  function fail(reason) {
    document.documentElement.setAttribute("data-fv-state", "error");
    console.error(
      "[ferrosa] version placeholders left blank — could not read " +
        url.href + ": " + reason
    );
  }

  fetch(url.href, { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      var products = (data && data.products) || {};
      var missing = [];

      nodes.forEach(function (node) {
        var key = node.getAttribute("data-fv");
        var part = node.getAttribute("data-fv-part") || "tag";
        var product = products[key];
        var value = product && product[part];

        if (!value) {
          missing.push(key + "." + part);
          return;
        }

        node.textContent =
          (node.getAttribute("data-fv-prefix") || "") +
          value +
          (node.getAttribute("data-fv-suffix") || "");
        node.removeAttribute("hidden");
      });

      if (missing.length) {
        fail("no value for " + missing.join(", "));
        return;
      }
      document.documentElement.setAttribute("data-fv-state", "ok");
    })
    .catch(function (error) {
      fail(error.message);
    });
})();
