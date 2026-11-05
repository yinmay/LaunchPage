// 验证正确 — the automated half. Run after `pnpm build`:
//   pnpm verify                      # starts `vite preview` itself
//   VERIFY_URL=http://... pnpm verify  # or check an already running / deployed site
//
// It checks what a reviewer would otherwise check by hand, and leaves evidence:
//   1. no TODO(brief) placeholders left in the source;
//   2. no console errors, no horizontal overflow, at desktop and phone widths;
//   3. every scene is reachable by scrolling and its caption matches (screenshot each);
//   4. reduced-motion visitors get every scene as static sections;
//   5. the hidden outline holds every scene for search engines and screen readers.
// Screenshots + report.json go to verify-output/. Exit code 1 on any failure.

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "verify-output");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];
const failures = [];
const report = { placeholders: [], viewports: {}, reducedMotion: null };

async function findPlaceholders(dir) {
  const hits = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) hits.push(...(await findPlaceholders(path)));
    else if (/\.(tsx?|html|css)$/.test(entry.name)) {
      const lines = (await readFile(path, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (line.includes("TODO(brief)")) hits.push(`${path.replace(ROOT, "")}:${i + 1}`);
      });
    }
  }
  return hits;
}

async function startPreview() {
  const child = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { cwd: ROOT, stdio: "pipe" });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("vite preview did not start in 20s")), 20000);
    child.stdout.on("data", (d) => {
      if (String(d).includes("4173")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return child;
}

async function launch() {
  // Prefer the installed Chrome; fall back to Playwright's bundled Chromium.
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

async function checkViewport(browser, url, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(OUT, `${vp.name}-00-hero.png`) });

  const track = page.getByTestId("story-track");
  const stops = (await track.getAttribute("data-stops")).split(",").map(Number);
  const keys = (await track.getAttribute("data-keys")).split(",");
  const scenes = [];
  for (let i = 0; i < stops.length; i += 1) {
    await page.evaluate((p) => {
      const t = document.querySelector('[data-testid="story-track"]');
      const v = document.querySelector('[data-testid="story-viewport"]');
      const top = t.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + p * (t.offsetHeight - v.offsetHeight));
    }, stops[i]);
    await page.waitForTimeout(900);
    const shown = await page.getByTestId("story-caption").getAttribute("data-scene-key");
    const file = `${vp.name}-${String(i + 1).padStart(2, "0")}-${keys[i]}.png`;
    await page.screenshot({ path: join(OUT, file) });
    scenes.push({ expected: keys[i], shown, screenshot: file });
    if (shown !== keys[i]) failures.push(`${vp.name}: scene ${keys[i]} showed caption ${shown}`);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) failures.push(`${vp.name}: horizontal overflow ${overflow}px`);
  const outline = await page.locator("#story .sr-only li").count();
  if (outline !== keys.length) failures.push(`${vp.name}: outline has ${outline} of ${keys.length} scenes`);
  if (errors.length) failures.push(`${vp.name}: console errors: ${errors.join(" | ")}`);
  report.viewports[vp.name] = { scenes, overflow, outline, errors };
  await page.close();
  return keys.length;
}

async function checkReducedMotion(browser, url, sceneCount) {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const count = await page.getByTestId("story-static-scene").count();
  await page.screenshot({ path: join(OUT, "reduced-motion.png"), fullPage: true });
  if (count !== sceneCount) failures.push(`reduced motion: ${count} of ${sceneCount} static scenes`);
  report.reducedMotion = { staticScenes: count };
  await context.close();
}

await mkdir(OUT, { recursive: true });
report.placeholders = await findPlaceholders(join(ROOT, "src"));
(await readFile(join(ROOT, "index.html"), "utf8")).split("\n").forEach((line, i) => {
  if (line.includes("TODO(brief)")) report.placeholders.push(`index.html:${i + 1}`);
});
if (report.placeholders.length) failures.push(`${report.placeholders.length} TODO(brief) placeholders left`);

const preview = process.env.VERIFY_URL ? null : await startPreview();
const url = process.env.VERIFY_URL ?? "http://localhost:4173/";
const browser = await launch();
try {
  let sceneCount = 0;
  for (const vp of VIEWPORTS) sceneCount = await checkViewport(browser, url, vp);
  await checkReducedMotion(browser, url, sceneCount);
} finally {
  await browser.close();
  preview?.kill();
}

report.failures = failures;
await writeFile(join(OUT, "report.json"), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`✗ ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`✓ verified ${url} — screenshots in verify-output/`);
