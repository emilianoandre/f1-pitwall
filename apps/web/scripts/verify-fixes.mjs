import { chromium } from "playwright";
const OUT = "/tmp/f1shots";
const ING = "http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1200 } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
await p.evaluate(() => { const r=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="Race"); r?.click(); });
await p.waitForFunction(() => /Live Timing/.test(document.body.innerText), { timeout: 20000 });
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.7})});
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/fx-dashboard.png`, fullPage: true });
const report = await p.evaluate(() => {
  const rc = document.body.innerText.includes("Race Control");
  const rcMsgs = /TRACK LIMITS|BLUE FLAG|DELETED|PENALTY/.test(document.body.innerText);
  // scroll containers present?
  const scrollers = [...document.querySelectorAll('div')].filter(d => {
    const s = getComputedStyle(d); return s.overflowY === 'auto' && d.scrollHeight > d.clientHeight + 4;
  }).length;
  return { raceControlPanel: rc, raceControlHasMessages: rcMsgs, scrollableAreas: scrollers };
});
// Go to driver detail, seek so laps exist
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.7})});
const db = await p.$('button:has-text("Driver detail")');
if (db) { await db.click(); await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/fx-driver.png`, fullPage: true }); }
const driver = await p.evaluate(() => ({
  hasAheadBehind: /CAR AHEAD/.test(document.body.innerText) && /CAR BEHIND/.test(document.body.innerText),
  hasLast10: /Last 10 Laps/.test(document.body.innerText),
}));
console.log(JSON.stringify({ ...report, ...driver, errors: errors.slice(0,4) }, null, 2));
await b.close();
