import { chromium } from "playwright";
const OUT="/tmp/f1shots"; const ING="http://localhost:4000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1660, height: 1200 } });
const errors=[]; p.on("pageerror",e=>errors.push(String(e)));
await p.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
await p.evaluate(()=>{const r=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="Race");r?.click();});
await p.waitForFunction(()=>/Live Timing/.test(document.body.innerText),{timeout:20000});
await fetch(`${ING}/api/player/control`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"seek",fraction:0.85})});
await p.waitForTimeout(1800);
const before = await p.evaluate(()=>({
  hasTeamRadioTab: /Team Radio/.test(document.body.innerText),
  hasRaceControlTab: /Race Control/.test(document.body.innerText),
  hasAllTeams: /All teams/.test(document.body.innerText),
  playButtons: [...document.querySelectorAll('button')].filter(x=>x.textContent==="▶").length,
  teamChips: [...document.querySelectorAll('button')].filter(x=>/Ferrari|McLaren|Mercedes|Red Bull|Alpine/.test(x.textContent||"")).length,
}));
await p.screenshot({ path: `${OUT}/radio-all.png`, fullPage: false, clip:{x:585,y:760,width:490,height:420} });
// Click a team filter chip (Ferrari) and re-check counts
const clicked = await p.evaluate(()=>{
  const btn=[...document.querySelectorAll('button')].find(x=>/^\s*Ferrari|McLaren/.test(x.textContent||"")||/Ferrari|McLaren/.test(x.textContent||""));
  if(btn){btn.click();return btn.textContent?.trim();}
  return null;
});
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/radio-filtered.png`, fullPage: false, clip:{x:585,y:760,width:490,height:420} });
console.log(JSON.stringify({ ...before, clickedTeam: clicked, errors: errors.slice(0,4) }, null, 2));
await b.close();
