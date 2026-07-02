import { chromium } from "playwright";
const ING="http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1300 } });
await p.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
await p.evaluate(()=>{const r=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="Race");r?.click();});
await p.waitForFunction(()=>/Live Timing/.test(document.body.innerText),{timeout:20000});
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.85})});
await p.waitForTimeout(1800);
// Find the panel whose gridArea is 'radio'
const box = await p.evaluate(()=>{
  const el=[...document.querySelectorAll('div')].find(d=>d.style.gridArea==="radio");
  if(!el)return null;
  el.scrollIntoView();
  const r=el.getBoundingClientRect();
  return {x:r.x,y:r.y,width:r.width,height:r.height};
});
if(box){ await p.screenshot({ path:"/tmp/f1shots/radio-panel.png", clip:{x:Math.max(0,box.x),y:Math.max(0,box.y),width:box.width,height:box.height} }); }
console.log("box:", JSON.stringify(box));
await b.close();
