import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => document.querySelectorAll("#cars g").length >= 20, { timeout: 30000 });

// Wait for a running phase: car dots spread across a wide bounding box (cars on
// track), not clustered in the pit lane. Measure spread of dot transforms.
await p
  .waitForFunction(
    () => {
      const gs = [...document.querySelectorAll("#cars g")];
      const xs = [];
      const ys = [];
      for (const g of gs) {
        const t = g.getAttribute("transform") ?? "";
        const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t);
        if (m) {
          xs.push(+m[1]);
          ys.push(+m[2]);
        }
      }
      if (xs.length < 10) return false;
      const spread = Math.max(...xs) - Math.min(...xs);
      return spread > 4000; // cars circulating, not lined up in the pits
    },
    { timeout: 40_000 },
  )
  .catch(() => console.log("(timed out waiting for running phase — capturing anyway)"));

await p.waitForTimeout(500);
const map = await p.$("svg");
await map.screenshot({ path: "/tmp/f1shots/trackmap2.png" });
console.log("captured");
await b.close();
