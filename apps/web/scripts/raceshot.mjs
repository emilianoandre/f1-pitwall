import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1400 } });
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => /BATTLES/i.test(document.body.innerText), { timeout: 40000 }).catch(()=>console.log("(no battles text)"));
// Let gap chart accumulate a few laps.
await p.waitForFunction(() => document.querySelectorAll("svg path").length >= 5, { timeout: 30000 }).catch(()=>{});
await p.waitForTimeout(2000);
await p.screenshot({ path: "/tmp/f1shots/race-full.png", fullPage: true });
const panel = await p.$("main > :last-child");
if (panel) await panel.screenshot({ path: "/tmp/f1shots/race-panel.png" });
const info = await p.evaluate(() => ({
  lap: (document.body.innerText.match(/LAP \d+ \/ \d+/)||[])[0],
  hasBattles: /BATTLES/i.test(document.body.innerText),
  hasStints: /STINTS & STOPS/i.test(document.body.innerText),
  hasGapChart: /GAP TO LEADER/i.test(document.body.innerText),
  gapChartPaths: document.querySelectorAll("svg path").length,
}));
console.log(JSON.stringify(info));
await b.close();
