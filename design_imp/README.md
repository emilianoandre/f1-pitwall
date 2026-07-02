# Handoff: F1 Race Dashboard — Trackside Broadcast (Live + Replay)

## Overview
A broadcast-style Formula 1 dashboard that shows either **live** race data or **replays** of recorded sessions and past Grands Prix, styled as **TV race graphics** (F1 red on near-black, condensed type, high-contrast). Three connected views:

1. **Session Picker** — enter the live session, replay a weekend session, or browse a per-year **Season Archive** (2023–2026).
2. **Race Dashboard** — the main multi-panel view: track map, live-timing tower, telemetry, sector times, tire strategy, weather, team radio, and a head-to-head battle panel. A **Live / Replay** toggle with a transport (play/pause, scrubber, 0.5–4× speed) drives the whole view.
3. **Driver Detail** — one driver's live telemetry, lap-time trend, stint history, last-lap sector breakdown, and filtered radio.

All race data is **simulated deterministically** from a single race-time clock `T` so the live numbers tick AND the replay scrubber works in both directions.

---

## About the Design Files
`F1 Broadcast Dashboard.dc.html` is a **design reference created in HTML** — a working prototype showing the intended look, layout, and behavior. It is **not** production code to copy directly. It's authored as a self-contained "Design Component" (a single HTML file + `support.js` runtime); ignore that wrapper — what matters is the **markup structure, inline styles, and the simulation logic**.

Your task: **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, etc.) using its established component patterns, state library, and charting approach. If there's no frontend environment yet, choose the most appropriate framework and implement there. Wire the panels to the **real backend feeds** (timing, telemetry, radio) in place of the simulation — the simulation only exists to make the prototype feel live.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final; recreate the UI pixel-close. The one intentional placeholder is the **track geometry** — each circuit is an abstract stylized loop, not a surveyed map (see Track Map).

---

## Design System — "Trackside Broadcast"
The look mimics broadcast TV race graphics: **F1 red on near-black**, **condensed** display/timing type, sharp corners, thin uppercase labels, and team liveries used only as data accents.

### Color tokens (CSS custom properties on `:root`)
| Token | Hex | Use |
|---|---|---|
| `--f1-bg` | `#101215` | app background base |
| `--f1-bg2` | `#08090B` | outer background / body (near-black) |
| `--f1-panel` | `#16181C` | card / panel surface |
| `--f1-panel2` | `#0D0E11` | nested / inset surface |
| `--f1-elev` | `#26282E` | raised element (active toggle segment) |
| `--f1-border` | `#2A2D33` | panel borders, dividers |
| `--f1-border2` | `#3A3E46` | stronger / hover border |
| `--f1-text` | `#FFFFFF` | primary text |
| `--f1-muted` | `#A6ABB2` | secondary text |
| `--f1-muted2` | `#6B7178` | tertiary / labels |
| `--f1-accent` | `#E10600` | **F1 red** — CTAs, live, active, brand |
| `--f1-accent2` | `#FF3B30` | bright red — accent text, telemetry trace |
| `--f1-green` | `#34D058` | positive / throttle / DRS / behind-gap |
| `--f1-amber` | `#FFC400` | warning / VSC / medium tire / sector line |
| `--f1-red` | `#E10600` | brake / soft tire / live dot / ahead-gap |
| `--f1-purple` | `#C46BFF` | fastest sector/lap (timing convention) |
| `--f1-cyan` | `#2BE0E0` | rain / tertiary data |

Page background adds a red radial glow: `radial-gradient(1200px 700px at 78% -10%, rgba(225,6,0,.14), transparent 60%)` over `--f1-bg2`.

### Team liveries (2026 grid) — data accents only
Deterministic per constructor. `contrastText(hex)`: use `#0A0F1C` on a color when its relative luminance `(0.299R+0.587G+0.114B)/255 > 0.62`, else `#fff` (used for the leaderboard position blocks).

| Team | Hex |  | Team | Hex |
|---|---|---|---|---|
| Red Bull Racing | `#2C64E6` | | Williams | `#4FA0F5` |
| Scuderia Ferrari | `#E8384F` | | Racing Bulls | `#8093FF` |
| Mercedes-AMG | `#27E0C4` | | Haas | `#C6CBD1` |
| McLaren | `#FF8000` | | Audi | `#D14A5E` |
| Aston Martin | `#2AA37F` | | Cadillac | `#C79C5B` |
| Alpine | `#3E9BE0` | | | |

### Tire compounds
Soft = `#E8384F` (letter `S`, white text) · Medium = `#F5B301` (`M`, `#1a1206`) · Hard = `#D8DEE9` (`H`, `#12181f`).

### Typography
- Display / headings / section titles: **Saira Condensed** (500/600/**700**). Bold and tight; buttons never all-caps but overline labels are uppercase.
- Body: **Saira** (400/500/600/700).
- Numeric / timing (lap times, gaps, speeds, lap counter, sectors): **Martian Mono** (condensed monospace, 400/500/700) — keeps digits aligned.
- Representative sizes: page hero `42px/700`; card titles `15px/500` (Saira Condensed); big data numbers `20–44px/700 mono`; body `12.5–13px`; overlines/labels `9.5–11px`, `.06–.12em` tracking, uppercase.

### Shape / elevation / motion
- **Sharp corners:** panels/cards `3px`; nested tiles `2–3px`; buttons, toggles & the scrubber thumb are **rectangular** (`1–2px`); tire/pos squares `2px`. (This is a deliberate move away from the pill/rounded language.)
- Borders: `1px solid --f1-border`; hover raises border to `--f1-border2`.
- Motion: buttons/cards lift `translateY(-2px)` on hover over 150ms ease; live/blink dots use a 1.4s blink; new radio messages fade+rise 300ms; telemetry bars & track badges transition ~100ms linear. Spacing is on an 8px grid; panel padding ~`14px 18px`; grid gaps `14px`.

### Keyframes
```css
@keyframes f1blink { 0%,55%{opacity:1} 56%,100%{opacity:.2} }
@keyframes f1pulse { 0%{box-shadow:0 0 0 0 rgba(232,56,79,.45)} 70%{box-shadow:0 0 0 7px rgba(232,56,79,0)} 100%{box-shadow:0 0 0 0 rgba(232,56,79,0)} }
@keyframes f1rise  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
```
Range input: track `6px` tall, filled portion `--f1-accent` via a `--pct` variable; thumb is an `8×22px` red bar with a white outline (a broadcast "playhead").

---

## Screens / Views

### 1. Session Picker
Centered column, `max-width:1180px`, `padding:34px 32px 80px`.
- **Top bar:** a `46px` red-gradient logo square (`135deg, #E10600 → #7A0400`, "P" glyph) + wordmark "PitWall" (Saira Condensed `20px/700`) + subtitle "Race Intelligence · 2026 Season"; right — green dot + "Systems nominal".
- **Live hero card:** full-width, `3px` radius, gradient `115deg, #16181C → #1A0C0C → #2A0D0D` with a red radial glow bottom-right. Red **LIVE · LAP n/70** chip (blinking dot); `h1` "Canadian Grand Prix" (`42px/700`); circuit + conditions sublines; primary red **"Enter live session"** button (play glyph, lifts on hover) + helper line.
- **"Replay a Session":** 5-column grid of weekend session cards — Practice 1/2/3, Qualifying, Race — each an overline tag (FRIDAY/SATURDAY/SUNDAY) + name + meta; loads the dashboard in **replay** on the Canada circuit.
- **"Season Archive":** header with title, a meta line `"{n} rounds · {year} season"`, and a **year segmented control** (`2026 2025 2024 2023`; active = `--f1-elev` fill). Below: a 4-column grid of round cards — each has a top bar in the winner's team color, `R{round} · {date}` + a `REPLAY` chip, GP name, `{circuit} · {laps} laps`, and `🏆 Winner {name}` (the trophy is the only emoji — replace with your icon set). Selecting a card opens the dashboard in **replay** on that round's circuit.

### 2. Race Dashboard
`max-width:1640px`, `padding:0 22px 34px`.
- **Sticky top bar:** back button; GP name + session chip + circuit subline; a **Live/Replay** rectangular segmented toggle (LIVE has a blinking dot, red when active); right — **LAP n/70** (Martian Mono `20px/700`), a divider, **RACE TIME** (mono), and a **flag chip** (GREEN green-tint / VSC amber-tint).
- **Replay transport** (replay mode only): a `40px` **square** red play/pause button, a mono "elapsed / total" readout, a **range slider** (red fill + white-outlined bar thumb), and four speed buttons `0.5× 1× 2× 4×` (active = red tint).
- **Panel grid** — CSS grid, `grid-template-columns: minmax(0,1.32fr) minmax(0,1fr) 336px`, `gap:14px`, areas:
  ```
  "track  track  board"
  "tele   timing board"
  "tire   tire   board"
  "weather radio h2h"
  ```
  Panels: `--f1-panel`, `1px --f1-border`, `3px` radius, header title `15px/500` Saira Condensed.
  - **Track Map** (`track`, body `360px`): inline SVG `viewBox 0 0 1000 560` (see Track Map). Legend: DRS zone (green), Sector line (amber).
  - **Live Timing tower** (`board`, spans 3 rows, internal scroll): header + right-aligned `INTERVAL` / `LAST LAP` labels. One clickable row per driver (all 22): a **team-color position block** (`26×22`, `2px`, position number in `contrastText`, Saira Condensed `14px/700`) · movement arrow (▲ green / ▼ red) · `code` (mono/700) · full `name` (muted, ellipsis) · green **DRS** chip when available · amber **PIT** chip when pitting · a tire square (compound letter) · **interval** to car ahead (mono; green if <1.0s) · **last lap** (mono). Focus row gets a team-color wash; clicking sets focus.
  - **Telemetry** (`tele`): header (team-color tick + "Telemetry" + focus `code`) with a **"Driver detail →"** button. Body: big **speed** (mono `44px`) + "KM/H"; **GEAR** tile; **DRS** tile ("OPEN" green / "—"); **THROTTLE** (green) & **BRAKE** (red) meters; **RPM** meter (red→amber→red gradient); a **speed trace** SVG (red line over a gridded area), "Speed trace · last 11s".
  - **Sector Times** (`timing`): top-7 table `DRIVER | S1 | S2 | S3 | LAST`. **Timing colors:** session-fastest in a column → **purple**; a driver's own strong sector → **green**; else default. Fastest last-lap shown → purple.
  - **Tire Strategy** (`tire`): top-8 gantt. Each row: team tick + code + a lap-1→total bar filled with **stint segments** (compound color + letter) and a **white playhead** at the current lap. Axis "Lap 1 / Lap 35 / Lap 70".
  - **Weather & Track** (`weather`): sun swatch + "Sunny · Dry"; 2×2 tiles — AIR TEMP, TRACK TEMP (°C), HUMIDITY (%), WIND (km/h); a **rain probability** bar (cyan) + %.
  - **Team Radio** (`radio`, internal scroll `max-height:210px`): "Team Radio" + blinking red dot. Newest-first; each message: team-color left rule, `CODE` (team color) + `LAP n`, message text. `FIA` messages use the neutral muted color.
  - **Head to Head** (`h2h`): the **battle around the focus driver** — three stacked rows: car **ahead**, **focus** (team-color tint + border), car **behind**. Each: team tick · `P{pos}` · `code` + surname · last lap · tire square · a right cell (focus → "FOCUS" tag; others → `AHEAD`/`BEHIND` label + gap in seconds, ahead red / behind green). Empty states: "Race leader — nothing ahead" / "Last on track — nothing behind". Rows click to re-focus.

### 3. Driver Detail
`max-width:1300px`.
- **Sticky bar:** "← Back to dashboard"; right — `{GP} · {session} · Lap n/70`.
- **Driver hero:** gradient panel, `6px` team-color left edge. Big car **number** (`64px/700`, team color); **name** (`30px/700` Saira Condensed) + team; right-aligned stat cluster — **POS** (`P{n}`), **GAP TO LEAD**, **LAST LAP**, **BEST LAP** (purple), **TIRE** (compound + age).
- **Two-column body** (`minmax(0,1.5fr) 340px`): left — **Live Telemetry** (same cluster), **Lap Time Trend** (SVG line per completed lap; fastest lap = purple dot), **Stint History** (compound tile + "Stint n · Soft/Medium/Hard" + lap range/count + "RUNNING"/"PIT L{n}"). Right — **Last Lap Sectors** (S1/S2/S3 bars scaled to the slowest, team-color fill, mono times, "Lap total" footer), **Driver Radio** (that driver only; empty-state text provided).

---

## Interactions & Behavior
- **Live / Replay:** Live pins to "now" (auto-advancing, blinking LIVE, no scrubbing). Replay reveals the transport and lets you move `T` freely.
- **Scrubber:** sets `T = value/100 × raceTotalSeconds`; reversible because all data derives from `T`.
- **Speed:** `0.5/1/2/4×` multiplies the advance rate.
- **Focus:** clicking a leaderboard row, an H2H row, or a track badge sets the focused driver → Telemetry, H2H (ahead/behind), and the enlarged track badge all update; sector highlighting is field-wide.
- **Navigation:** Picker → Dashboard → Driver detail → back.
- **Flag:** a scripted Virtual Safety Car appears on laps 44–45 (amber chip + an FIA radio line); else GREEN. In production, drive from race control.
- **Responsive:** desktop-first (~1640 design width); collapse the 3-column grid to stacked panels and the tower to a scroll list on narrow viewports.

## State Management
Prototype state (replace the simulation with real feeds; keep the shape):
- `screen`: `'picker' | 'dashboard' | 'driver'`
- `mode`: `'live' | 'replay'`; `playing`: bool; `speedMult`: `0.5 | 1 | 2 | 4`
- `T`: race time in **seconds** (master clock — live increments it, replay sets it)
- `focus`: driver code; `trackId`: `gilles | sakhir | jeddah | melbourne | suzuka | miami | monaco | barcelona`
- `archiveYear`: `'2026' | '2025' | '2024' | '2023'`; `gpName`, `circuitName`, `session`
- Derived per tick: running order (sort by distance), `lapNow`, gaps/intervals, per-driver last/best lap + sectors, current tire stint, telemetry (speed/gear/throttle/brake/rpm/DRS from track position), weather jitter, revealed radio.

**Simulation model (prototype only):** each driver has a `secondsPerLap` pace; `distance(driver,T) = T/spl + small sinusoidal wobble` (wobble creates realistic position battles); track position `t = distance % 1`. A per-circuit **speed profile** derived from path curvature (sharp turn → low speed) feeds the focus car's telemetry. Lap/sector times are deterministic hashes of `(driver, lap)`. **In production, replace all of this with real timing/telemetry;** the UI only needs the derived values above. Live-timing + telemetry + radio feeds for live mode; a recordings API keyed by `(year, round)` for replay, with seek = scrub.

## Track Map (placeholder geometry)
Each circuit is an **array of waypoints** in a `1000×560` space, smoothed into a closed SVG path via a Catmull-Rom → cubic-bezier conversion (control points at `±(next-prev)/6`). Distinct silhouette per track, but **stylized, not surveyed** — swap in real outlines (SVG/GeoJSON) for production.
Layers (bottom→top): dark "bed" stroke (`#0A1120`, w30), "asphalt" stroke (`#22314C`, w22), dashed center line, green **DRS** overlay on high-speed segments, amber **sector ticks** at ~⅓/⅔, a white **start/finish** line, and one **driver badge** per car — a team-colored rounded-rect (`~29×15`; focus `~36×18` with a white outline) carrying the 3-letter code (mono, `contrastText`), positioned at the car's interpolated point; badges transition ~100ms for smooth motion. Positions come from `distance % 1` mapped onto the sampled path (`getPointAtLength`; precompute a polyline in production).

## Assets
- **Fonts:** Saira, Saira Condensed, Martian Mono (Google Fonts). Substitute equivalents if your stack prefers.
- **Logo:** "PitWall" is a CSS red-gradient square with a "P" — replace with the real product/brand mark.
- **Icons:** only emoji is 🏆 on archive cards — replace with your icon library (e.g. lucide/MUI). Play/pause/back use text glyphs; substitute real icons.
- **Track outlines:** placeholder (see above) — source real circuit SVGs.
- No photography in chrome.

## Files
- `F1 Broadcast Dashboard.dc.html` — the full interactive prototype (all three views + simulation). Open in a browser for live behavior; read its markup + logic for exact structure, inline styles, and derivation formulas.
- `support.js` — the Design-Component runtime the prototype loads (reference only; not needed in your implementation).

## Implementation notes
- The whole UI derives from the single `T` clock — model that explicitly; it makes live/replay/scrub fall out naturally.
- Timing colors (purple = session best, green = personal best) are an F1 convention — keep them.
- Team color is the ONLY place liveries appear; everything else stays in the red/black system.
- The `componentDidUpdate` re-sample in the prototype is a runtime quirk; in your framework, just resample/recompute the track polyline whenever `trackId` changes.
