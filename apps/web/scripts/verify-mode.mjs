import { chromium } from "playwright";
const ING = "http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await fetch(`${ING}/api/mode`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ mode: "player" }) });
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);

// Click "Live" in the toggle.
await p.getByRole("button", { name: /Live/ }).click();
await p.waitForTimeout(1500);
const liveHealth = await (await fetch(`${ING}/api/health`)).json();
const liveUI = await p.evaluate(() => ({
  showsIdleOrSession: /No live session|Grand Prix|LAP/.test(document.body.innerText),
  hasDelay: /Delay/i.test(document.body.innerText),
  hasTransport: document.querySelector('input[aria-label="timeline scrubber"]') !== null,
}));
await p.screenshot({ path: "/tmp/f1shots/mode-live.png", fullPage: true });

// Switch back to Replay.
await p.getByRole("button", { name: "Replay" }).click();
await p.waitForTimeout(1200);
const replayHealth = await (await fetch(`${ING}/api/health`)).json();

console.log(JSON.stringify({
  liveMode: liveHealth.mode, liveConnected: liveHealth.connected,
  liveUI, replayMode: replayHealth.mode,
  errors: errors.slice(0,3),
}, null, 2));
await b.close();
