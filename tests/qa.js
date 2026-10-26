// Browser QA for the built site: run `npm run build`, then `npm run qa`.
//
// Serves dist/ the way GitHub Pages does (directory index, 404.html fallback)
// and checks every page in the sitemap at desktop and phone widths, plus the
// interactive features: search, theme, backlinks, graphs, callouts and contents.
//
// Options:
//   --dist <dir>       site to test (default: dist)
//   --screens <dir>    also save screenshots of key pages there
const fs = require("fs");
const http = require("http");
const path = require("path");

const { chromium } = require("playwright");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DIST = path.resolve(option("--dist", "dist"));
const SCREENS = option("--screens", null);
const AXE_SOURCE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

// Sample pages used by the feature checks.
const NOTE_WITH_TOC = "/discipline/final-diet-plan/";
const NOTE_WITH_BACKLINKS = "/setups/pillars-areas-projects-and-routines/";
const NOTE_WITH_CALLOUT = "/setups/pillars-areas-projects-and-routines/";
const LESSON = "/ai-chats/shabab-activity-gen/lessons/module-4/lesson-01-logical-fallacies/";
const SEARCH_PAGE = "/setups/edc-list/";

// ---------------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------------

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".webmanifest": "application/manifest+json",
};

function startServer(root) {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      // Malformed percent-encoding: treat as not found.
      pathname = "/__invalid__";
    }
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": CONTENT_TYPES[".html"] });
      return res.end(fs.readFileSync(path.join(root, "404.html")));
    }
    res.writeHead(200, { "content-type": CONTENT_TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function open(browser, base, url, { device = "desktop", colorScheme = "dark" } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[device], colorScheme });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 404/.test(message.text())) errors.push(message.text());
  });
  page.on("dialog", (dialog) => {
    errors.push(`unexpected dialog: ${dialog.message()}`);
    dialog.dismiss();
  });
  page.on("request", (request) => requests.push(request.url()));
  page.on("requestfailed", (request) => {
    // Headless Chromium aborts PDF iframes; that isn't a site problem.
    if (!request.url().endsWith(".pdf")) failed.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url() !== base + url) failed.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(base + url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(300);
  return { context, page, errors, failed, requests, status: response && response.status() };
}

async function axeViolations(page) {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) }));
  });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function checkSitemapAndFeed(base) {
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  check("sitemap lists pages without double slashes", urls.length > 10 && !/<loc>https?:\/\/[^<]*[^:]\/\//.test(sitemap), `${urls.length} pages`);
  check("sitemap leaves out the 404 page", !urls.some((u) => /404/.test(u)));

  const feed = await (await fetch(`${base}/feed.xml`)).text();
  check("feed.xml has entries and no double slashes", /<entry>/.test(feed) && !/https?:\/\/[^\s"<]*[^:]\/\//.test(feed));
  return urls;
}

async function checkAllPages(browser, base, urls) {
  const linkTargets = new Set();
  const axeSummary = {};
  for (const device of Object.keys(VIEWPORTS)) {
    const problems = [];
    for (const url of urls) {
      const { context, page, errors, failed, status } = await open(browser, base, url, { device });
      const info = await page.evaluate(() => {
        const main = document.querySelector("main");
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          charset: !!document.querySelector("meta[charset]"),
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || "",
          canonical: document.querySelector('link[rel="canonical"]')?.href || "",
          h1Count: document.querySelectorAll("h1").length,
          badAlt: [...document.querySelectorAll("main img")].filter((img) => !img.hasAttribute("alt") || /\|\d+$|\.(png|jpe?g)$|\\$/i.test(img.alt)).length,
          unsizedImages: [...document.querySelectorAll("main picture img")].filter((img) => !img.getAttribute("width") || !img.getAttribute("height") || img.loading !== "lazy").length,
          internalNewTab: [...document.querySelectorAll('main a[target="_blank"]:not(.pdf-embed-download)')].filter((a) => new URL(a.href).host === location.host).map((a) => a.href),
          unfocusableClickables: [...document.querySelectorAll("[onclick]")].filter((el) => el.tabIndex < 0 && !["BUTTON", "A", "INPUT"].includes(el.tagName)).length,
          tagsWithoutHref: document.querySelectorAll("a.tag:not([href])").length,
          linksTo404: main ? main.querySelectorAll('a[href="/404"]').length : 0,
          rawEmbeds: main ? (main.innerText.match(/!\[\[[^\]]+\]\]/g) || []).length : 0,
          links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
        };
      });
      const issues = [];
      if (status !== 200) issues.push(`status ${status}`);
      if (errors.length) issues.push(`errors: ${errors.join("; ")}`);
      if (failed.length) issues.push(`failed requests: ${failed.join("; ")}`);
      if (info.overflow > 1) issues.push(`scrolls sideways by ${info.overflow}px`);
      if (!info.charset) issues.push("no meta charset");
      if (!info.title) issues.push("no title");
      if (!info.description) issues.push("no meta description");
      if (!info.canonical || /[^:]\/\//.test(info.canonical)) issues.push(`bad canonical ${info.canonical}`);
      if (info.h1Count < 1) issues.push("no <h1>");
      if (info.badAlt) issues.push(`${info.badAlt} images with missing or file-name alt text`);
      if (info.unsizedImages) issues.push(`${info.unsizedImages} images without size or lazy loading`);
      if (info.internalNewTab.length) issues.push(`internal links opening a new tab: ${info.internalNewTab.join(", ")}`);
      if (info.unfocusableClickables) issues.push(`${info.unfocusableClickables} clickable elements unreachable by keyboard`);
      if (info.tagsWithoutHref) issues.push(`${info.tagsWithoutHref} tags without href`);
      if (info.linksTo404) issues.push(`${info.linksTo404} links pointing at /404`);
      if (info.rawEmbeds) issues.push(`${info.rawEmbeds} raw ![[embeds]]`);
      info.links.forEach((link) => {
        const target = new URL(link);
        if (target.origin === base) linkTargets.add(target.pathname);
      });
      if (device === "desktop") {
        for (const violation of await axeViolations(page)) {
          const entry = (axeSummary[violation.id] = axeSummary[violation.id] || { impact: violation.impact, pages: 0, example: violation.nodes[0] });
          entry.pages++;
        }
      }
      if (issues.length) problems.push(`${url}: ${issues.join(" | ")}`);
      await context.close();
    }
    check(`[${device}] all ${urls.length} pages load cleanly and pass the page checks`, problems.length === 0, problems.slice(0, 8).join("\n        "));
  }

  const broken = [];
  for (const target of linkTargets) {
    const response = await fetch(base + target);
    if (response.status !== 200) broken.push(`${response.status} ${target}`);
  }
  check("every internal link resolves", broken.length === 0, `${linkTargets.size} targets${broken.length ? `; broken: ${broken.slice(0, 10).join(", ")}` : ""}`);

  const lines = Object.entries(axeSummary).map(([id, v]) => `${id} (${v.impact}) on ${v.pages} pages, e.g. ${v.example}`);
  check("accessibility (axe, WCAG 2 A/AA, dark theme): no violations", lines.length === 0, lines.join("\n        "));
}

async function checkLightTheme(browser, base) {
  const problems = [];
  for (const url of ["/", NOTE_WITH_BACKLINKS, LESSON, "/does-not-exist/"]) {
    const { context, page } = await open(browser, base, url, { colorScheme: "light" });
    const theme = await page.evaluate(() => document.body.className.match(/theme-(light|dark)/)?.[1]);
    if (theme !== "light") problems.push(`${url}: theme is ${theme}`);
    for (const violation of await axeViolations(page)) {
      problems.push(`${url}: ${violation.id} (${violation.impact}) e.g. ${violation.nodes[0]}`);
    }
    await context.close();
  }
  check("light theme follows the system setting and passes axe", problems.length === 0, problems.slice(0, 8).join("\n        "));

  const { context, page, errors } = await open(browser, base, NOTE_WITH_TOC, { colorScheme: "dark" });
  const before = await page.evaluate(() => document.body.classList.contains("theme-dark"));
  await page.click(".navbar .theme-toggle");
  const after = await page.evaluate(() => ({
    light: document.body.classList.contains("theme-light"),
    label: document.querySelector(".theme-toggle").getAttribute("aria-label"),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  await page.reload({ waitUntil: "networkidle" });
  const persisted = await page.evaluate(() => document.body.classList.contains("theme-light"));
  check("theme toggle switches dark ↔ light and is remembered", before && after.light && persisted && /dark/i.test(after.label) && errors.length === 0,
    `${JSON.stringify(after)} persisted=${persisted} ${errors.join("; ")}`);
  await context.close();
}

async function checkSecurity(browser, base) {
  const payloads = ['<img src=x onerror="document.title=\'PWNED\'">', '"><svg onload="document.title=\'PWNED\'">', '<script>document.title="PWNED"</script>'];
  for (const payload of payloads) {
    const { context, page, errors } = await open(browser, base, `${SEARCH_PAGE}?q=${encodeURIComponent(payload)}`);
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      title: document.title,
      injected: !!document.querySelector("#search-results img, #search-results svg[onload], #search-results script"),
    }));
    check(`search query is shown as text, not run: ${payload.slice(0, 28)}…`, state.title !== "PWNED" && !state.injected && !errors.some((e) => e.startsWith("unexpected dialog")), `title "${state.title}"`);
    await context.close();
  }

  const { context, page, requests } = await open(browser, base, NOTE_WITH_TOC);
  const unpinned = await page.evaluate(() =>
    [...document.querySelectorAll('script[src^="http"], link[rel="stylesheet"][href^="http"]')].filter((el) => !el.integrity).map((el) => el.src || el.href)
  );
  check("third-party scripts and styles are version-pinned with SRI", unpinned.length === 0 && !requests.some((r) => r.includes("@latest")), unpinned.join(", "));
  const unwanted = ["mermaid", "whatwg-fetch", "luxon", "searchIndex.json", "flexsearch", "_vercel"].filter((name) => requests.some((r) => r.includes(name)));
  check("note pages don't load unused scripts or the search index up front", unwanted.length === 0, unwanted.join(", "));
  const fonts = requests.filter((r) => r.includes("/fonts/"));
  check("fonts are served as WOFF2", fonts.length > 0 && fonts.every((f) => f.endsWith(".woff2")));
  await context.close();
}

async function checkSearch(browser, base) {
  {
    const { context, page, requests } = await open(browser, base, SEARCH_PAGE);
    await page.locator(".navbar .search-button").focus();
    await page.keyboard.press("Control+k");
    const opened = await page.evaluate(() => document.getElementById("globalsearch").classList.contains("active") && document.activeElement.id === "term");
    check("Ctrl+K opens search with the input focused", opened);
    await page.waitForTimeout(800);
    check("search index loads on first open", requests.some((r) => r.includes("searchIndex.json")) && requests.some((r) => r.includes("flexsearch")));
    await page.fill("#term", "diet");
    await page.waitForSelector(".searchresult", { timeout: 5000 }).catch(() => {});
    const count = await page.locator(".searchresult").count();
    check("typing or pasting a query shows results", count > 0, `${count} results for "diet"`);
    await page.waitForTimeout(600);
    const previewTitle = await page.evaluate(() => document.querySelector("#preview-content .preview-title")?.textContent.trim());
    check("the first result is previewed", !!previewTitle, previewTitle);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    const target = await page.evaluate(() => document.querySelector(".searchresult.active").dataset.url);
    await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
    check("arrow keys and Enter open a result", decodeURI(new URL(page.url()).pathname) === decodeURI(target), target);
    await context.close();
  }
  {
    const { context, page } = await open(browser, base, SEARCH_PAGE);
    await page.locator(".navbar .search-button").click();
    await page.fill("#term", "zzzxqv");
    await page.waitForTimeout(1200);
    const message = await page.evaluate(() => document.querySelector("#search-results .no-results")?.textContent.trim());
    check("no-results message repeats the query", !!message && message.includes("zzzxqv"));
    await page.keyboard.press("Escape");
    const closed = await page.evaluate(() => ({ open: document.getElementById("globalsearch").classList.contains("active"), focus: document.activeElement.className }));
    check("Escape closes search and returns focus", !closed.open && /search-button/.test(closed.focus), JSON.stringify(closed));
    await page.keyboard.press("Control+k");
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    check("Tab stays inside the open search dialog", await page.evaluate(() => document.getElementById("globalsearch").contains(document.activeElement)));
    await context.close();
  }
  {
    const { context, page } = await open(browser, base, SEARCH_PAGE, { device: "mobile" });
    check("phones don't show the Ctrl K hint", !(await page.locator(".navbar .search-keys").isVisible().catch(() => false)));
    await page.locator(".navbar .search-button").tap();
    await page.fill("#term", "diet");
    await page.waitForSelector(".searchresult", { timeout: 5000 }).catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("search works on phones without sideways scrolling", (await page.locator(".searchresult").count()) > 0 && overflow <= 1);
    await context.close();
  }
}

async function checkNotes(browser, base) {
  {
    const { context, page } = await open(browser, base, "/");
    const home = await page.evaluate(() => ({
      notes: document.querySelectorAll("#notes .note-list a").length,
      fileNameTitles: [...document.querySelectorAll("#notes a, .recent-card-title")].filter((a) => /^lesson-/.test(a.textContent.trim())).length,
      recent: document.querySelectorAll(".recent-card").length,
      footerRss: !!document.querySelector('.site-footer a[href="/feed.xml"]'),
    }));
    check("homepage lists the notes, recent cards and footer", home.notes > 30 && home.recent > 0 && home.footerRss && home.fileNameTitles === 0, JSON.stringify(home));
    await context.close();
  }
  {
    const { context, page } = await open(browser, base, LESSON);
    const state = await page.evaluate(() => ({ title: document.title, h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()) }));
    check("slug-named notes use their heading as the title, shown once", state.title === "Logical Fallacies" && state.h1.length === 1, JSON.stringify(state));
    await context.close();
  }
  {
    const { context, page } = await open(browser, base, "/productivtiy/productivity-tactics/");
    await page.waitForURL(/\/productivity\/productivity-tactics\/$/, { timeout: 5000 }).catch(() => {});
    check("old URLs redirect to their new location", page.url().endsWith("/productivity/productivity-tactics/"), page.url());
    await context.close();
  }
  {
    const { context, page, errors } = await open(browser, base, `${NOTE_WITH_TOC}#no-such-section`);
    await page.evaluate(() => { location.hash = "still-missing"; });
    await page.waitForTimeout(200);
    check("unknown #fragments don't cause errors", errors.length === 0, errors.join("; "));
    await context.close();
  }
  {
    const { context, page } = await open(browser, base, "/does-not-exist/");
    const title = await page.evaluate(() => document.title);
    const links = await page.locator(".not-found a").count();
    check("unknown URLs show the 404 page with a way back", /nothing here/i.test(title) && links >= 2);
    await context.close();
  }
  {
    const { context, page, errors } = await open(browser, base, NOTE_WITH_CALLOUT);
    await page.waitForTimeout(500);
    const title = page.locator(".callout.is-collapsible .callout-title").first();
    const before = await title.getAttribute("aria-expanded");
    await title.focus();
    await page.keyboard.press("Enter");
    const after = await title.getAttribute("aria-expanded");
    check("collapsible callouts toggle with the keyboard", before !== after, `${before} → ${after}`);
    const unpublished = await page.evaluate(() => ({
      spans: document.querySelectorAll("main span.is-unresolved").length,
      links: document.querySelectorAll('main a[href="/404"]').length,
    }));
    check("links to unpublished notes render as plain text", unpublished.spans > 0 && unpublished.links === 0, JSON.stringify(unpublished));
    check("no errors on a note with callouts", errors.length === 0, errors.join("; "));
    await context.close();
  }
  {
    const { context, page, errors } = await open(browser, base, NOTE_WITH_TOC);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator("main h2").first().hover();
    await page.waitForTimeout(300);
    const anchor = page.locator("main h2 .heading-anchor").first();
    const opacity = await anchor.evaluate((el) => getComputedStyle(el).opacity);
    await anchor.click();
    await page.waitForTimeout(300);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    check("heading # links appear on hover and copy the section URL", opacity === "1" && /#.+/.test(copied) && page.url() === copied, copied);
    const firstActive = await page.evaluate(() => document.querySelector(".sidebar .toc a.is-active")?.textContent.trim());
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(600);
    const laterActive = await page.evaluate(() => document.querySelector(".sidebar .toc a.is-active")?.textContent.trim());
    check("contents highlight the section being read", !!firstActive && !!laterActive && firstActive !== laterActive, `${firstActive} → ${laterActive}`);
    check("no errors while reading a note", errors.length === 0, errors.join("; "));
    await context.close();
  }
  {
    const { context, page } = await open(browser, base, NOTE_WITH_TOC, { device: "mobile" });
    const visible = await page.locator(".toc-inline").isVisible();
    await page.click(".toc-inline summary");
    const links = await page.locator(".toc-inline a").count();
    await page.locator(".toc-inline a").nth(1).click();
    await page.waitForTimeout(400);
    check("phones get an inline 'On this page' that navigates", visible && links > 3 && page.url().includes("#"), `${links} links`);
    const fits = await page.evaluate(() => {
      const title = document.querySelector(".site-title");
      return title.scrollWidth <= title.clientWidth;
    });
    check("the site name fits in the phone navbar", fits);
    await context.close();
  }
}

async function checkConnections(browser, base) {
  const { context, page, errors } = await open(browser, base, NOTE_WITH_BACKLINKS);
  const backlinks = await page.$$eval(".connections .backlink", (links) => links.map((a) => a.textContent.trim()));
  check("backlinks list the notes that link here", backlinks.includes("Weekly Planning") && backlinks.includes("Quarterly Planning"), backlinks.join(", "));

  await page.locator(".connections").scrollIntoViewIfNeeded();
  await page.waitForSelector("#link-graph canvas", { timeout: 10000 }).catch(() => {});
  const local = await page.evaluate(() => {
    const canvas = document.querySelector("#link-graph canvas");
    return canvas ? [canvas.clientWidth, canvas.clientHeight] : null;
  });
  check("local graph renders", !!local && local[0] > 100 && local[1] > 100, JSON.stringify(local));

  await page.click(".graph-header .graph-button");
  await page.waitForSelector("#full-graph-container canvas", { timeout: 10000 }).catch(() => {});
  const full = await page.evaluate(() => ({
    canvas: !!document.querySelector("#full-graph-container canvas"),
    focus: document.activeElement.id,
  }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById("full-graph")).display === "none");
  check("full graph opens as a dialog and Escape closes it", full.canvas && full.focus === "full-graph-close" && closed, JSON.stringify({ ...full, closed }));

  await page.click(".navbar .theme-toggle");
  await page.waitForTimeout(300);
  check("no errors with graphs open across a theme switch", errors.length === 0, errors.join("; "));
  await context.close();

  const { context: emptyContext, page: emptyPage } = await open(browser, base, LESSON);
  const message = await emptyPage.evaluate(() => document.querySelector(".connections .no-backlinks-message")?.textContent.trim());
  check("notes without backlinks say so", !!message, message);
  await emptyContext.close();
}

async function saveScreens(browser, base) {
  fs.mkdirSync(SCREENS, { recursive: true });
  for (const colorScheme of ["dark", "light"]) {
    for (const device of Object.keys(VIEWPORTS)) {
      for (const [name, url] of [["home", "/"], ["note", NOTE_WITH_BACKLINKS], ["404", "/does-not-exist/"]]) {
        const { context, page } = await open(browser, base, url, { device, colorScheme });
        await page.screenshot({ path: path.join(SCREENS, `${colorScheme}-${device}-${name}.png`), fullPage: true });
        await context.close();
      }
    }
  }
}

// ---------------------------------------------------------------------------

(async () => {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error(`No built site in ${DIST}. Run "npm run build" first.`);
    process.exit(2);
  }
  const server = await startServer(DIST);
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const urls = await checkSitemapAndFeed(base);
    await checkAllPages(browser, base, urls);
    await checkLightTheme(browser, base);
    await checkSecurity(browser, base);
    await checkSearch(browser, base);
    await checkNotes(browser, base);
    await checkConnections(browser, base);
    if (SCREENS) await saveScreens(browser, base);
  } catch (error) {
    check("QA run completed", false, error.stack);
  } finally {
    await browser.close();
    server.close();
  }
  const failures = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})();
