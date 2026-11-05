// 定义正确 — the research half. Give it the product's URL (production, staging or a local
// dev server started from the codebase) and it collects what the brief and the story need:
//
//   pnpm capture https://your-product.com                 # just the home page
//   pnpm capture https://your-product.com --pages /,/pricing,/docs
//   pnpm capture --config capture.config.json             # pages + elements to zoom into
//
// Writes:
//   public/shots/<name>.png         real desktop screenshot (1280 wide, top MAX_HEIGHT px)
//   public/shots/<name>-phone.png   real phone screenshot (390 wide, first screen)
//   src/story/shots.json            each shot's size + the rects of its `focus` elements,
//                                   so the camera can zoom onto REAL UI by name
//   research/brand.json             the product's own colours, fonts, headings and nav —
//                                   the input for the @theme tokens and the brief
//
// capture.config.json:
//   { "base": "https://…", "pages": [ { "name": "home", "path": "/", "focus": { "pricing": "#pricing" } } ] }

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const WIDTH = 1280;
const MAX_HEIGHT = 2400;

function parseArgs(argv) {
  const args = { base: null, pages: null, config: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--pages") args.pages = argv[++i].split(",");
    else if (argv[i] === "--config") args.config = argv[++i];
    else if (!argv[i].startsWith("--")) args.base = argv[i];
  }
  return args;
}

const slug = (path) => (path === "/" ? "home" : path.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase());

async function loadPlan() {
  const args = parseArgs(process.argv.slice(2));
  if (args.config) {
    const config = JSON.parse(await readFile(join(ROOT, args.config), "utf8"));
    return { base: config.base, pages: config.pages };
  }
  if (!args.base) {
    console.error("usage: pnpm capture <url> [--pages /,/a,/b] | --config capture.config.json");
    process.exit(1);
  }
  const paths = args.pages ?? ["/"];
  return { base: args.base, pages: paths.map((path) => ({ name: slug(path), path, focus: {} })) };
}

async function launch() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

/** The product's own look, read from computed styles rather than guessed. */
function readBrand() {
  const style = (el) => (el ? getComputedStyle(el) : null);
  const solid = (c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent";
  const body = style(document.body);
  const h1 = document.querySelector("h1");
  const link = document.querySelector("main a, a");
  // The primary action is the most saturated solid background among links and buttons —
  // not simply the first one, which is often a nav item painted in the page colour.
  const saturation = (c) => {
    const [r, g, b] = (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const buttons = [...document.querySelectorAll("a, button")]
    .filter((el) => solid(style(el).backgroundColor) && style(el).backgroundColor !== body.backgroundColor)
    .sort((a, b) => saturation(style(b).backgroundColor) - saturation(style(a).backgroundColor));
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
  return {
    title: document.title,
    description: meta("description"),
    themeColor: meta("theme-color"),
    colors: {
      background: body.backgroundColor,
      text: body.color,
      heading: style(h1)?.color ?? null,
      link: style(link)?.color ?? null,
      primaryButton: buttons[0] ? style(buttons[0]).backgroundColor : null,
      primaryButtonText: buttons[0] ? style(buttons[0]).color : null,
    },
    // Headings often style an inner span (e.g. a hero title), so read the innermost element.
    fonts: { body: body.fontFamily, heading: style(h1?.querySelector("*:not(br)") ?? h1)?.fontFamily ?? null },
    headings: [...document.querySelectorAll("h1, h2")].slice(0, 20).map((h) => h.textContent.trim()),
    nav: [...document.querySelectorAll("nav a")].slice(0, 12).map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href") })),
  };
}

const plan = await loadPlan();
await mkdir(join(ROOT, "public/shots"), { recursive: true });
await mkdir(join(ROOT, "research"), { recursive: true });

const browser = await launch();
const shots = {};
let brand = null;
try {
  for (const page of plan.pages) {
    const url = new URL(page.path, plan.base).toString();
    const desktop = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 1.5 });
    await desktop.goto(url, { waitUntil: "networkidle" });
    await desktop.waitForTimeout(400);
    // A dev server can be showing its error overlay instead of the page (a stale build
    // error). A screenshot of that is not the product — stop rather than ship it.
    if (await desktop.locator("vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay").count()) {
      throw new Error(`${url} is showing a dev-server error overlay — fix the build or restart the server, then capture again`);
    }
    const full = await desktop.evaluate(() => document.documentElement.scrollHeight);
    const height = Math.min(full, MAX_HEIGHT);
    // Grow the viewport to the captured height instead of using fullPage: fixed elements
    // (sidebars, sticky navs) then render the way a reader sees them, not cut off at 900px.
    await desktop.setViewportSize({ width: WIDTH, height });
    await desktop.waitForTimeout(300);
    await desktop.screenshot({ path: join(ROOT, `public/shots/${page.name}.png`) });

    const focus = {};
    for (const [key, selector] of Object.entries(page.focus ?? {})) {
      const rect = await desktop.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
      }, selector);
      if (!rect) console.warn(`! ${page.name}: focus "${key}" (${selector}) not found`);
      else if (rect.y + rect.h > height) console.warn(`! ${page.name}: focus "${key}" is below the ${MAX_HEIGHT}px crop`);
      else focus[key] = rect;
    }
    if (!brand) brand = await desktop.evaluate(readBrand);
    await desktop.close();

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    await phone.goto(url, { waitUntil: "networkidle" });
    await phone.waitForTimeout(400);
    await phone.screenshot({ path: join(ROOT, `public/shots/${page.name}-phone.png`) });
    await phone.close();

    shots[page.name] = { src: `shots/${page.name}.png`, phone: `shots/${page.name}-phone.png`, url, w: WIDTH, h: height, focus };
    console.log(`✓ ${page.name}  ${url}  ${WIDTH}×${height}  focus: ${Object.keys(focus).join(", ") || "—"}`);
  }
} finally {
  await browser.close();
}

await writeFile(join(ROOT, "src/story/shots.json"), `${JSON.stringify(shots, null, 2)}\n`);
await writeFile(join(ROOT, "research/brand.json"), `${JSON.stringify(brand, null, 2)}\n`);
console.log("→ src/story/shots.json, research/brand.json");
