import { chromium } from "playwright";
const ING = "http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1150 } });
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
await p.evaluate(() => { const r=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="Race"); r?.click(); });
await p.waitForFunction(() => /Live Timing/.test(document.body.innerText), { timeout: 20000 });
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.62})});
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"play"})});
await p.waitForTimeout(2000);
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pause"})});
await p.waitForTimeout(500);
// crop the leaderboard (right column) and telemetry
await p.screenshot({ path: "/tmp/f1shots/dz-board.png", clip: { x: 1180, y: 90, width: 470, height: 640 } });
await p.screenshot({ path: "/tmp/f1shots/dz-tele.png", clip: { x: 22, y: 470, width: 560, height: 260 } });
await b.close();
console.log("done");
