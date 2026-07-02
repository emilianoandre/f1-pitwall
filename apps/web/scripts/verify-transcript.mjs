import { chromium } from "playwright";
const ING="http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1320 } });
const errors=[]; p.on("pageerror",e=>errors.push(String(e)));
await p.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
await p.evaluate(()=>{const r=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="Race");r?.click();});
await p.waitForFunction(()=>/Live Timing/.test(document.body.innerText),{timeout:20000});
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.95})});
await p.waitForTimeout(1800);
const hasToggle = await p.evaluate(()=>{
  const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");
  return el ? /Audio/.test(el.innerText) && /Transcript/.test(el.innerText) : false;
});
// Click Transcript in the radio panel
await p.evaluate(()=>{
  const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");
  [...el.querySelectorAll('button')].find(x=>x.textContent?.trim()==="Transcript")?.click();
});
await p.waitForTimeout(600);
const info = await p.evaluate(()=>{
  const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");
  const txt=el.innerText;
  return { withText: (txt.match(/DELETED|TRACK LIMITS|PENALTY|NOTED|INVESTIGATION/g)||[]).length, noneMsg: /No transcript text available/.test(txt) };
});
const box = await p.evaluate(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");el.scrollIntoView();const r=el.getBoundingClientRect();return {x:Math.max(0,r.x),y:Math.max(0,r.y),width:r.width,height:r.height};});
await p.screenshot({ path:"/tmp/f1shots/transcript.png", clip:box });
console.log(JSON.stringify({ hasToggle, ...info, errors: errors.slice(0,4) }, null, 2));
await b.close();
