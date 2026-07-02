import { chromium } from "playwright";
const ING="http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1320 } });
const errors=[]; p.on("pageerror",e=>errors.push(String(e)));
await p.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
await p.waitForFunction(()=>!/Loading sessions/.test(document.body.innerText),{timeout:30000});
// Click a DOWNLOADED Race chip (green, title="Play (downloaded)").
await p.evaluate(()=>{
  const chip=[...document.querySelectorAll('button[title="Play (downloaded)"]')].find(x=>x.textContent?.trim()==="Race");
  chip?.click();
});
await p.waitForFunction(()=>/Live Timing/.test(document.body.innerText),{timeout:30000});
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.62})});
await p.waitForTimeout(2000);
const report = await p.evaluate(()=>{
  const tire=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="tire");
  const h2h=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="h2h");
  const tireTxt = tire?.innerText ?? "";
  const h2hTxt = h2h?.innerText ?? "";
  return {
    session: (document.body.innerText.match(/\w+ Grand Prix/)||[])[0],
    pitStopsHeader: /PIT STOPS/.test(tireTxt),
    pitEntries: (tireTxt.match(/\d\d?\.\ds/g)||[]).length,
    degEntries: (tireTxt.match(/[+-]\d\.\d\ds\/lap/g)||[]).length,
    forecast: (h2hTxt.match(/closing [\d.]+s\/lap( · DRS in ~\d+ laps)?|losing [\d.]+s\/lap|in DRS range|evenly matched/gi)||[]).slice(0,3),
  };
});
for (const area of ["tire","h2h"]) {
  const box = await p.evaluate((a)=>{const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea===a);if(!el)return null;el.scrollIntoView();const r=el.getBoundingClientRect();return {x:Math.max(0,r.x),y:Math.max(0,r.y),width:r.width,height:Math.min(r.height,620)};}, area);
  if (box) await p.screenshot({ path:`/tmp/f1shots/metric-${area}.png`, clip:box });
}
console.log(JSON.stringify({ ...report, errors: errors.slice(0,4) }, null, 2));
await b.close();
