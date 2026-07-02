import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !/Loading sessions/.test(document.body.innerText), { timeout: 30000 }).catch(()=>{});
const info = await p.evaluate(() => {
  const active = [...document.querySelectorAll("button")].find(
    (x) => /^\d{4}$/.test(x.textContent?.trim() ?? "") && getComputedStyle(x).backgroundColor !== "rgba(0, 0, 0, 0)"
  );
  const years = [...document.querySelectorAll("button")].map(x=>x.textContent?.trim()).filter(t=>/^\d{4}$/.test(t||""));
  const meta = (document.body.innerText.match(/\d+ events · \d{4}/) || [])[0];
  const gps = (document.body.innerText.match(/Grand Prix/g) || []).length;
  return { activeYear: active?.textContent?.trim(), years, meta, gpMentions: gps };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
