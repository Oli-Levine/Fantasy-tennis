// Phone-width screenshots of every screen, for layout QA.
// Usage: start the app (e.g. `DEV_SKIP_AUTH=1 npm run dev`), then
//   BASE_URL=http://localhost:3000 npm run screenshots
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = process.env.OUT_DIR ?? "screenshots";
const PAGES = [
  "/login", "/", "/team", "/league", "/league/u3", "/rules", "/admin",
  "/admin/players", "/admin/players/import", "/admin/rules", "/admin/gameweeks", "/results", "/admin/users",
];

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

let problems = 0;
for (const path of PAGES) {
  await page.goto(BASE_URL + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) {
    problems++;
    console.warn(`⚠ ${path}: ${overflow}px horizontal overflow`);
  }
  const file = `${OUT_DIR}/${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`✓ ${path} → ${file}`);
}

await browser.close();
process.exit(problems ? 1 : 0);
