import { chromium } from "playwright";

const OUT = "/tmp/f1shots";
const ING = "http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
p.on("pageerror", (e) => errors.push(String(e)));

await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });

// 1. Empty player state → "No recording loaded" + a Select button.
await p.waitForFunction(() => /No recording loaded/.test(document.body.innerText), { timeout: 15000 });
await p.screenshot({ path: `${OUT}/player-empty.png` });

// 2. Open the picker, verify it lists recordings.
await p.getByRole("button", { name: "Select a session" }).click();
await p.waitForFunction(() => /Select a session/.test(document.body.innerText), { timeout: 5000 });
const pickerItems = await p.evaluate(
  () => document.querySelectorAll(".fixed button").length,
);
await p.screenshot({ path: `${OUT}/player-picker.png` });

// 3. Wait for the list to finish loading, then load the qualifying recording.
await p.waitForFunction(() => !/Loading sessions/.test(document.body.innerText), { timeout: 30000 });
const qualiRow = p.getByText("Spanish Grand Prix — Qualifying");
await qualiRow.waitFor({ timeout: 10000 });
await qualiRow.click();
// Picker closes and the dashboard populates with driver data.
await p.waitForFunction(() => /VER|NOR/.test(document.body.innerText), { timeout: 25000 });

// 4. Drive the player via the control API to the yellow-flag window (sector 14).
await fetch(`${ING}/api/player/control`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "seek", valueMs: 946689164000 }),
});
await p.waitForTimeout(1500);
const yellowSectors = await p.evaluate(
  () => document.querySelectorAll("svg path.flag-pulse").length,
);
await p.screenshot({ path: `${OUT}/player-yellow.png` });
const map = await p.$("svg");
if (map) await map.screenshot({ path: `${OUT}/player-yellow-map.png` });

// 5. Transport: play, check playhead advances, then pause.
const status = async () => (await (await fetch(`${ING}/api/health`)).json());
await fetch(`${ING}/api/player/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "speed", speed: 10 }) });
await fetch(`${ING}/api/player/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seek", fraction: 0.2 }) });
const before = await (await fetch(`${ING}/api/player/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "play" }) })).json();
await p.waitForTimeout(1500);
const after = await (await fetch(`${ING}/api/player/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause" }) })).json();

console.log(JSON.stringify({
  pickerItems,
  yellowSectorsRendered: yellowSectors,
  playAdvanced: after.playheadMs > before.playheadMs,
  playDeltaMs: Math.round(after.playheadMs - before.playheadMs),
  consoleErrors: errors.slice(0, 5),
}, null, 2));

await b.close();
