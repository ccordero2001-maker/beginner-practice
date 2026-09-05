# BOLD — The Arc of Power

A single-page landing site built around one idea: the physics of a kettlebell swing as
the visual argument for a brand's evolution. The heritage mark (a simple outlined
kettlebell) ignites into a metallic 3D bell, swings through a scroll-driven arc, and
disintegrates at peak elevation into data nodes that resolve into the three service
pillars.

```
[ Hero: Heritage ] ──▶ [ The Swing: Transition ] ──▶ [ Landing: Modern Ecosystem ]
  outlined kettlebell     kinetic arc + trail          BOLD spectrum shift
  charcoal / silver       amber / ember                indigo / obsidian / gold
```

## Run it

Any static server; there is no build step.

```bash
npx http-server -p 8099 .    # then open http://127.0.0.1:8099
```

## Files

| Path | What it does |
|---|---|
| `index.html` | Markup for both the animated stage and the reduced-motion twin, plus the full page below the fold |
| `css/styles.css` | All styling. Phase-reactive tokens (`--bg`, `--accent`) are rewritten by JS as you scroll |
| `js/swing-scene.js` | Three.js scene: the bell, the procedural metal environment, the projected glow trail, the particle burst |
| `js/main.js` | Scroll driver, spring physics, phase state machine, palette shift, motion-mode switch, below-fold behaviour |
| `js/vendor/three.min.js` | Three.js r128, vendored (see note below) |

## How the transition works

**The swing is not a scroll-mapped animation curve.** Scroll position sets a *target*
angle; a damped spring chases it, and the reader's scroll velocity is injected straight
into angular velocity. Flick the wheel and the bell overshoots; ease off and it lags
behind you. That lag is the sense of mass, and it is the whole point — a direct
`progress → angle` mapping feels weightless.

Some specifics worth knowing before you edit anything:

- **The morph is registered, not faked.** At rest, `main.js` measures the outlined SVG
  mark's bounding box and converts it to a world-space anchor and scale, so the 3D bell
  occupies the *exact* screen footprint of the 2D outline. They cross-fade in place. If
  you resize the mark in CSS, the 3D bell follows automatically.
- **The arc is framed backwards from where the burst should land.** `PEAK_SCREEN` in
  `main.js` names the viewport fraction where peak elevation should occur; the pendulum
  anchor is then solved for so the top of the arc lands there at any aspect ratio.
- **The burst is deterministic in scroll progress,** not time-based, so the whole
  sequence scrubs cleanly in reverse.
- **The trail is a 2D overlay,** not WebGL. The bell's world position is projected to
  screen space and drawn as a smoothed, tapered ribbon — a projected ribbon reads far
  hotter than a 1px WebGL line and costs almost nothing. Samples are only recorded when
  the bell actually moves, so the arc persists while the reader pauses, and a scroll
  teleport starts a new arc instead of drawing a chord across the screen.

Sequence timing lives in one block of constants at the top of `js/main.js`
(`MORPH_IN`, `SWING_FROM`, `SWING_PEAK`, `BURST_FROM`, `REVEAL_FROM`, …), expressed as
fractions of the stage's scroll length. Change the stage's `height` in CSS to make the
whole sequence longer or shorter without touching the timing.

## The reduced-motion twin

`prefers-reduced-motion: reduce`, a missing WebGL context, or a failed Three.js load all
route to `#stage-static` — not the animated stage with its animations disabled, but its
own composed layout: a left-aligned hero and three cards that tell the same three phases
with their own static artwork. The nav toggle switches between the two and remembers the
choice in `localStorage`; an explicit choice wins over the OS setting.

## Notes on the build

**Three.js is vendored rather than loaded from a CDN.** `cdnjs` is blocked by egress
policy in the environment this was built in, so the library is committed at
`js/vendor/three.min.js` (r128, ~600 KB, licence included alongside it). This also means
the page works offline and has no third-party runtime dependency. r128 specifically,
because it still ships a UMD build exposing a global `THREE`, and because it predates
Three's colour-management change — note that in r128 material colours are treated as
**linear** and encoded to sRGB on output, so the hex values in `swing-scene.js` look far
darker than they render. They are chosen for how they look, not how they read.

**Fonts** come from Google Fonts (Space Grotesk + Inter) with real fallback stacks. That
is the one external request the page makes; self-host them if you'd rather have none.

## ⚠️ Demo content — replace before publishing

This is a design build. **Every concrete fact on the page is invented placeholder copy.**
Nothing below is real, verified, or sourced, and none of it should go in front of a
customer as-is. Each item is flagged with an HTML comment in `index.html` and marked
`data-demo-copy="true"` where it sits in a block.

| Where | What is fabricated |
|---|---|
| Hero eyebrow | "Est. 2014 · San José, Costa Rica" — founding year and location |
| B2C transformation card | +11.4% strength, 142→165 kg, +2,400 reps, 91% adherence, 64→57 bpm |
| B2B dashboard | "Northwind Logistics", 312 enrolled, 74% weekly active, −18% sick days, 8.4 culture score, the sparkline |
| App preview | The session, the loads, the three ring percentages, the coach message |
| Metrics band | 12 years, 2,400+ clients, 38 enterprise programs, 91% retention |
| Testimonials | All three quotes, names (Elena Márquez, Tobias Lund, Priya Raghunathan), roles and companies (Northwind Logistics, Halcyon Group) |
| Pricing | $149 / $420 / Custom, and every inclusion listed |
| Contact form | Front-end only — not wired to any backend. Submitting says so on screen |

The positioning matrix and the three copywriting hooks are the only content taken from
the brief rather than invented.

Testimonials are the highest-risk item here: they read as genuine endorsements from real
people. Replace them with permissioned quotes or delete the section — do not ship them.
