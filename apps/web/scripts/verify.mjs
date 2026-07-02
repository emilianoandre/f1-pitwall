// Visual verification: drive the running dashboard and screenshot key views.
import { chromium } from "playwright";

const OUT = "/tmp/f1shots";
const URL = process.env.URL ?? "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });

// Wait until the timing tower has real rows (driver TLAs rendered).
await page.waitForFunction(
  () => document.body.innerText.includes("VER") || document.body.innerText.includes("NOR"),
  { timeout: 30_000 },
);
// Wait for real lap times (mm:ss.mmm) to appear so we capture a rich moment.
await page
  .waitForFunction(() => /\d:\d\d\.\d\d\d/.test(document.body.innerText), { timeout: 40_000 })
  .catch(() => {});
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const text = document.body.innerText;
  const tlas = (text.match(/\b[A-Z]{3}\b/g) ?? []).filter((t) =>
    ["VER", "NOR", "HAM", "LEC", "SAI", "RUS", "PIA", "PER", "ALO", "GAS"].includes(t),
  );
  return {
    hasSessionName: text.includes("Grand Prix"),
    uniqueTlas: [...new Set(tlas)].length,
    hasSegmentBadge: /Q[123]\b/.test(text),
    carDots: document.querySelectorAll("#cars g").length,
    trackPath: document.querySelectorAll("svg path").length,
    hasRaceControl: text.includes("Race Control"),
    sampleLap: (text.match(/\d:\d\d\.\d\d\d/) ?? [])[0] ?? null,
  };
});

await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });

// Zoom the track map region.
const map = await page.$("svg");
if (map) await map.screenshot({ path: `${OUT}/trackmap.png` });

console.log(JSON.stringify({ report, consoleErrors: errors.slice(0, 10) }, null, 2));

await browser.close();
