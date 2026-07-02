import { chromium } from "playwright";
const ING="http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1300 } });
await p.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
await p.evaluate(()=>{const r=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="Race");r?.click();});
await p.waitForFunction(()=>/Live Timing/.test(document.body.innerText),{timeout:20000});
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.85})});
await p.waitForTimeout(1500);
// distinct driver TLAs visible before filter (in radio panel)
const countTLAs = () => p.evaluate(()=>{
  const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");
  if(!el)return {};
  const tlas=[...el.querySelectorAll('*')].map(n=>n.textContent).filter(t=>/^[A-Z]{3}$/.test(t||""));
  const uniq=[...new Set(tlas)];
  return { total: tlas.length, drivers: uniq };
});
const all = await countTLAs();
// click Ferrari filter
await p.evaluate(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");[...el.querySelectorAll('button')].find(x=>x.textContent?.includes("Ferrari"))?.click();});
await p.waitForTimeout(500);
const ferrari = await countTLAs();
const box = await p.evaluate(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
await p.screenshot({ path:"/tmp/f1shots/radio-ferrari.png", clip:box });
console.log(JSON.stringify({ allDrivers: all.drivers, ferrariOnly: ferrari.drivers }, null, 2));
await b.close();
