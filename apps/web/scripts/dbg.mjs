import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on("console", (m) => errs.push(`${m.type()}: ${m.text()}`));
p.on("pageerror", (e) => errs.push("pageerror: " + String(e)));
p.on("requestfailed", (r) => errs.push(`reqfail: ${r.url()} ${r.failure()?.errorText}`));
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
const bodyBefore = await p.evaluate(() => document.body.innerText.slice(0, 120));
// open picker
const sel = await p.$('button:has-text("Select a session"), button:has-text("Select recording")');
if (sel) await sel.click();
await p.waitForTimeout(3500);
const picker = await p.evaluate(() => {
  const modal = document.querySelector(".fixed");
  return modal ? modal.innerText.slice(0, 300) : "(no modal)";
});
console.log("BODY:", bodyBefore);
console.log("PICKER:", picker);
console.log("ERRORS:", JSON.stringify(errs.slice(0, 8), null, 1));
await b.close();
