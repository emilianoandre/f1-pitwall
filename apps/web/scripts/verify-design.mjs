import { chromium } from "playwright";
const OUT = "/tmp/f1shots";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 1 });
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
p.on("pageerror", (e) => errors.push(String(e)));

// 1. Picker screen.
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/dz-picker.png`, fullPage: true });
const pickerOK = await p.evaluate(() => /PitWall|Season Archive|Enter live/.test(document.body.innerText));

// 2. The race is already loaded server-side; navigate to dashboard.
//    Since screen state is client-side and starts at 'picker', click a downloaded Race chip if present,
//    otherwise the transport/dashboard is reached by the store. Simplest: use the store via a Race chip.
// Fallback: force dashboard by clicking "Enter live session"? No — use a downloaded Spanish Race chip.
const raceChip = await p.$('button[title*="Play"]');
// Instead of relying on chip, drive screen through the picker's Spanish GP Race:
await p.evaluate(() => {
  // no-op; we click below
});

// Click the Spanish GP group's downloaded chips: find a chip labelled "Race" that is green.
const clicked = await p.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const race = btns.find((x) => x.textContent?.trim() === "Race");
  if (race) { race.click(); return true; }
  return false;
});
await p.waitForFunction(() => /Live Timing|Telemetry/.test(document.body.innerText), { timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/dz-dashboard.png`, fullPage: true });
const dashInfo = await p.evaluate(() => ({
  panels: ["Live Timing","Telemetry","Sector Times","Tire Strategy","Weather","Race Control","Head to Head","Track Map"].filter(t=>document.body.innerText.includes(t)),
}));

// 3. Driver detail via "Driver detail →"
const detailBtn = await p.$('button:has-text("Driver detail")');
if (detailBtn) { await detailBtn.click(); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/dz-driver.png`, fullPage: true }); }

console.log(JSON.stringify({ pickerOK, clickedRace: clicked, dashPanels: dashInfo.panels, hadDetailBtn: !!detailBtn, errors: errors.slice(0,6) }, null, 2));
await b.close();
