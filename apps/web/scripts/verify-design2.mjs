import { chromium } from "playwright";
const OUT = "/tmp/f1shots";
const ING = "http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1150 } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));

await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
// Click Spanish GP "Race" chip → loads (resets to start) → dashboard.
await p.evaluate(() => {
  const race = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Race");
  race?.click();
});
await p.waitForFunction(() => /Live Timing/.test(document.body.innerText), { timeout: 20000 });
// Now seek to mid-race + play briefly so telemetry/positions populate.
await fetch(`${ING}/api/player/control`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "seek", fraction: 0.62 }) });
await fetch(`${ING}/api/player/control`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "speed", speed: 4 }) });
await fetch(`${ING}/api/player/control`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "play" }) });
await p.waitForTimeout(2500);
await fetch(`${ING}/api/player/control`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "pause" }) });
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/dz-dash-live.png`, fullPage: true });
const leader = await p.evaluate(() => {
  const rows = document.body.innerText;
  return { speedNonZero: !/\b0\s*KM\/H/i.test(rows) , sample: rows.slice(0,0) };
});
await b.close();
console.log(JSON.stringify({ errors: errors.slice(0,4) }));
