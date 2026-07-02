import { chromium } from "playwright";
const OUT = "/tmp/f1shots";
const ING = "http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
p.on("pageerror", (e) => errors.push(String(e)));

// Ensure clean player mode with no recording.
await fetch(`${ING}/api/mode`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ mode: "player" }) });

await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);

// Mode toggle present?
const hasToggle = await p.evaluate(() => /Live/.test(document.body.innerText) && /Replay/.test(document.body.innerText));

// Open picker via the "Select a session" button.
await p.getByRole("button", { name: "Select a session" }).click();
await p.waitForFunction(() => !/Loading sessions/.test(document.body.innerText), { timeout: 30000 });
await p.waitForTimeout(500);

// Grouped? Count group headers (GP names with sessions count) vs session rows.
const groupInfo = await p.evaluate(() => {
  const txt = document.body.innerText;
  const groups = (txt.match(/\d+ sessions/g) || []).length;
  const hasGP = /Grand Prix/.test(txt);
  const sessionsVisibleBeforeExpand = (txt.match(/\bPLAY\b|\bDOWNLOAD\b/g) || []).length;
  return { groups, hasGP, sessionsVisibleBeforeExpand };
});
await p.screenshot({ path: `${OUT}/picker-grouped.png`, fullPage: true });

// Expand a group (Spanish GP is auto-expanded since it has downloads). Expand Austrian.
await p.getByText("Austrian Grand Prix").click();
await p.waitForTimeout(400);
const afterExpand = await p.evaluate(() => (document.body.innerText.match(/\bDOWNLOAD\b/g) || []).length);
await p.screenshot({ path: `${OUT}/picker-expanded.png`, fullPage: true });

console.log(JSON.stringify({ hasToggle, ...groupInfo, downloadBtnsAfterExpand: afterExpand, consoleErrors: errors.slice(0,5) }, null, 2));
await b.close();
