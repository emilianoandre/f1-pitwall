import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => /No live session|Off-season/.test(document.body.innerText), { timeout: 15000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.screenshot({ path: "/tmp/f1shots/idle.png", fullPage: true });
const info = await p.evaluate(() => ({
  heading: (document.querySelector("h1")?.textContent) ?? "",
  hasCountdown: /\d+d |\d+h /.test(document.body.innerText),
  hasSchedule: document.body.innerText.includes("Weekend schedule"),
  hasPodium: document.body.innerText.includes("Last race"),
}));
console.log(JSON.stringify(info));
await b.close();
