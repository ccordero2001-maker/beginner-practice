# BOLD — The Arc of Power

A landing page built around one idea: the physics of a kettlebell swing as the visual
argument for a brand's evolution. The heritage mark ignites into a metallic 3D bell,
swings through a scroll-driven arc, and disintegrates at peak elevation into data nodes
that resolve into three service pillars.

Shipped in **three palettes**, each with **light and dark modes**, from one markup source.

```
[ Hero: heritage ] ──▶ [ The swing ] ──▶ [ The ecosystem ]
  outlined bell         kinetic arc       who it's for → pillars → how it works
  (always dark canvas)  palette-tinted    → pricing → FAQ → contact
```

## Run it

No build step to serve. Any static server:

```bash
npx http-server -p 8099 .        # → http://127.0.0.1:8099
```

| Page | Palette |
|---|---|
| `index.html` | **Modern Wellness** — white / cast-iron charcoal / sage / teal |
| `heritage.html` | **Heritage Chalk** — slate / chalk white / rust / copper |
| `tradition.html` | **Warm Tradition** — cream / chocolate / forest green / burnished gold |
| `compare.html` | all three side by side, with a light/dark switch |

## Files

| Path | What it does |
|---|---|
| `src/page.html` | **The single markup source.** Edit this, never the generated pages |
| `build.js` | Generates the three palette pages from it (`node build.js`) |
| `css/palettes.css` | Six token sets — 3 palettes × light/dark — plus the fixed stage tokens |
| `css/styles.css` | Structure and components. Consumes only tokens, so a palette swap restyles everything |
| `js/main.js` | Theme + motion modes, the scroll driver, spring physics, page behaviour |
| `js/swing-scene.js` | Three.js scene: the bell, the metal environment, the trail, the particle burst |
| `js/vendor/three.min.js` | Three.js r128, vendored |
| `tools/contrast.js` | Validates all 130 token pairings. Exits non-zero on failure |
| `AUDIT.md` | The measured UX/UI audit and what was fixed |

Editing flow: `src/page.html` → `node build.js` → `node tools/contrast.js`.

## The palette system

Every component reads structural tokens (`--bg`, `--fg`, `--accent`, `--accent-ink`,
`--line`…), never a literal colour. A palette is therefore a drop-in swap, and adding a
fourth means adding one token block — not restyling anything.

Colours come from the "Kettlebell Tradition" palette sheet. Where a source colour could
not carry text at 4.5:1 it is kept for fills and a readable sibling carries the meaning;
`tools/contrast.js` encodes that rule so it is enforced rather than remembered. Full
table in `AUDIT.md`.

**The intro animation stays on a dark canvas in every palette and every theme.** Additive
glow, screen blending and glowing particles do not survive a white ground — they wash out.
So the swing plays in its own cinema band and hands off into the palette below it, which
also happens to reinforce the "iron becomes intelligence" story. The trail, particles and
emissive metal are re-tinted per palette from `--swing-*` tokens, live: switching theme
re-tints the running scene without rebuilding it.

## Dark mode

A toggle in the header, next to the motion toggle. It defaults to the OS setting, follows
OS changes until the reader makes an explicit choice, then remembers that choice in
`localStorage`. Applied by an inline script before first paint, so there is no flash of
the wrong theme, and `theme-color` updates with it.

## How the transition works

**The swing is not a scroll-mapped animation curve.** Scroll sets a *target* angle; a
damped spring chases it, and the reader's scroll velocity is injected straight into
angular velocity. Flick the wheel and the bell overshoots; ease off and it lags. That lag
is the sense of mass, and it is the point — a direct `progress → angle` mapping feels
weightless.

- **The morph is registered, not faked.** At rest, `main.js` measures the outlined SVG
  mark's bounding box and converts it to a world-space anchor and scale, so the 3D bell
  occupies the exact screen footprint of the 2D outline. Resize the mark in CSS and the
  3D follows.
- **The arc is framed backwards from where the burst should land.** `PEAK_SCREEN` names
  the viewport fraction for peak elevation; the pendulum anchor is solved so the top of
  the arc lands there at any aspect ratio.
- **The burst is deterministic in scroll progress**, so the sequence scrubs in reverse.
- **The trail is a 2D overlay**, not WebGL — the bell's world position projected to screen
  space and drawn as a smoothed, tapered ribbon. Samples are only recorded when the bell
  moves, so the arc persists while the reader pauses.

Timing lives in one block of constants at the top of `js/main.js`, as fractions of the
stage's scroll length. Change the stage's `height` in CSS to make the whole sequence
longer or shorter without touching them.

## Accessibility and performance

- **Three.js is loaded on demand.** Reduced-motion and no-WebGL readers never download the
  589KB library. Turning motion on fetches it and builds the scene then.
- **A designed reduced-motion twin**, not the animated stage with animations switched off:
  its own layout telling the same three phases with static artwork.
- **Nothing below 13px**, every interactive target at least 44×44, one visible `<h1>`, no
  heading-level jumps, visible form labels, and a distinct error state.
- **The comparison table stacks into cards** below 760px rather than scrolling sideways.
- Contrast verified at every breakpoint in all six palette/theme combinations.

## Notes on the build

Three.js is vendored at r128 rather than loaded from a CDN — it still ships a UMD build
exposing a global `THREE`, and the page then has no third-party runtime dependency. Note
that r128 predates Three's colour-management change: material colours are treated as
**linear** and encoded to sRGB on output, so the hex values in `swing-scene.js` render far
lighter than they read. They are tuned by eye.

Fonts come from Google Fonts (Space Grotesk + Inter) with real fallback stacks — the one
external request the page makes.

## ⚠️ Demo content — replace before publishing

**Every concrete fact on these pages is invented placeholder copy.** Each item is flagged
with an HTML comment in `src/page.html` and marked `data-demo-copy="true"`, and the footer
says so on the page.

| Where | What is fabricated |
|---|---|
| B2C card | +11.4% strength, 142→165 kg, +2,400 reps, 91% adherence, 64→57 bpm |
| B2B dashboard | "Northwind Logistics", 312 enrolled, 74% active, −18% sick days, 8.4 culture score |
| App preview | The session, the loads, the ring percentages, the coach message |
| Metrics band | 12 years, 2,400+ people, 38 programs, 91% retention |
| Testimonials | All three quotes, names, roles and companies |
| Pricing | $149 / $420 / "Let's talk", and every inclusion |
| "How it works" | The 45-minute, 3-working-day and 12-week figures |
| Contact card | Phone number, email address and opening hours |
| Contact form | Front-end only. Submitting says on screen that nothing was sent |

The testimonials are the highest-risk item: they read as genuine endorsements from real
people. Replace with permissioned quotes or delete the section — do not ship them.
