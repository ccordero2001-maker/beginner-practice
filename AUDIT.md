# UX / UI audit — BOLD "The Arc of Power"

Audited against the commit that introduced the page (`ef9fe07`). Every number below was
measured in Chromium at 1440×900, 390×844 and 320×720, not estimated: contrast ratios are
computed from resolved colours composited against their real effective backgrounds,
tap targets from live bounding boxes, transfer sizes from actual responses.

The brief for this audit was: usable and legible for **a young athlete through a senior
citizen**, and credible for **a mom-and-pop micro business through a regional company** —
while staying attractive and distinctive. Those two goals pull against each other, and
most of what follows is where the original build chose "distinctive" and paid for it.

---

## Severity 1 — blocks comprehension or access

### 1.1 4,140px of scrolling before a single word of content
Measured: the animated stage is `460vh`; `#ecosystem` begins at **4,140px** on desktop and
**2,870px** on mobile. That is roughly 4.5 full screens of scroll-scrubbed animation before
the visitor learns what is sold, to whom, or at what price.

The hero copy fades to zero opacity at ~16% of the sequence, so for the remaining ~84%
the visitor is looking at an animation with **no words on it at all** except a rotating
one-line hook. A hidden skip-link exists but is only reachable by keyboard.

Why it fails the brief: an older visitor, anyone on a trackpad, anyone with a slow device,
and anyone who is simply in a hurry has no idea whether scrolling further is worth it.
"Sexy" is not the same as "withholding".

### 1.2 The page never says what actually happens next
There is no "who this is for", no "how it works", no FAQ, and no human contact route.
A visitor is expected to already know what a hybrid coaching platform is and to
self-diagnose which of the three pillars they belong to. The mom-and-pop end of the
audience has nothing to grab.

### 1.3 Fourteen text elements render below 12px
Measured sizes: `9.6px` (ring labels), `10.1px` (dashboard stat labels), `10.6px`
(`.col-tag`, `.plan__flag`, `.avatar`), `10.9px`, `11.2px` (`.pillar__tag`, `.pill`,
`.phone__greet`), `11.5px` (`.eyebrow`, `.scroll-cue`), `11.8px`.

Below ~12px, presbyopic readers — effectively everyone over about 45 — cannot read text
without zooming. The pillar tags ("B2C · Personal Training") and the table column tags
("Legacy" / "Evolution") are *structural navigation*, not decoration, and they are among
the smallest text on the page.

### 1.4 Fifteen interactive targets below the 44×44px minimum
Desktop: nav links are `58×24`, `65×24`, `26×24`, `63×24`; the three `.link-arrow` CTAs are
`194×23`, `213×23`, `135×23`; footer links `~50×23`; the motion toggle `83×38`.
Mobile: the motion toggle collapses to **28×28** and the footer links stay at 23px tall.

WCAG 2.5.8 asks for 24×24 minimum; 2.5.5 (AAA) and every mobile HIG ask for 44×44. A
26×24px "App" link is a coin-toss for anyone with less than perfect motor control.

### 1.5 No mobile navigation at all
Below 1000px `.nav__links` is `display:none` with no replacement. On a phone the header
is a logo and a motion toggle — the site's four sections are unreachable except by
scrolling the whole page or finding the footer.

---

## Severity 2 — real defects worth fixing now

### 2.1 589KB of Three.js downloads for users who will never see it
Measured identically in all three modes, **including `prefers-reduced-motion: reduce`**:
`three.min.js = 589KB`. Reduced-motion users, no-WebGL users, and anyone who toggled to
Static pay the full library cost for a scene that is never constructed. The script tag is
unconditional in `<head>`-order markup.

### 2.2 Two genuine contrast failures
Everything else on the page passes. These two do not:

| Element | Size | Measured | Required |
|---|---|---|---|
| `.scroll-cue` "Scroll to swing" | 11.5px | **3.39:1** | 4.5:1 |
| `.foot__note` (the demo-content disclaimer) | 12.8px | **4.17:1** | 4.5:1 |

The disclaimer failing is the ironic one — the text warning that the page's content is
fabricated is itself the hardest text on the page to read.

**Ten further "failures" reported by the checker are artifacts, not defects.** Elements
using `background-clip:text` resolve to `color: transparent` (ratio 1.0), and elements on
gradient backgrounds resolve to `background-color: transparent`, so an automated pass
mis-reads both. Verified by hand: `.hero__title em` (silver→white→gold on near-black) is
≥19:1, `.metric__num` ≥15:1, and dark text on the amber→gold button gradient is 9.4:1.
All pass comfortably. Flagging this because the same false positives will reappear in any
future automated run.

### 2.3 `scroll-behavior: smooth` is not gated on reduced motion
Set unconditionally on `html`. Users who asked the OS for less motion still get animated
scroll on every anchor jump — including the skip-link, which is the one control that
exists specifically to help them.

### 2.4 The form has no visible labels and no error state
Both fields use `sr-only` labels with the placeholder as the only visible cue. Placeholders
disappear on focus, are the wrong colour for low-vision users, and are lost entirely once
text is typed — a known failure mode for older users and for anyone re-checking a form
before submitting. Separately, the error message and the success message render in the
**same gold colour** with no icon, so "that email doesn't look right" and "nothing was
sent" are visually indistinguishable at a glance.

### 2.5 The positioning table becomes a horizontal scroller on phones
The document itself does not overflow — the table correctly scrolls inside its own
`overflow-x:auto` container, so this is not a WCAG reflow failure. But at 320–390px the
comparison table is 661px wide inside a 320px window, meaning the reader must scroll
sideways to compare the two columns the section exists to compare. A side-by-side
comparison that cannot be seen side by side has lost its argument.

---

## Severity 3 — worth knowing, lower stakes

- **Two `<h1>` elements in the DOM.** Only ever one is rendered (`display:none` removes the
  other from the accessibility tree), so this is not an actual defect — but it will keep
  showing up in automated reports.
- **The three copywriting hooks are `aria-hidden`.** Correct for the first two, which are
  atmosphere. The third contains the brand payoff ("Welcome to BOLD") and is the only
  place it is stated during the sequence.
- **No `theme-color` meta and no favicon**, so the browser tab and mobile address bar
  fall back to defaults.
- **The metric counter rewrites `textContent` on every animation frame**, which some
  screen readers will announce repeatedly if the element is in a live region context.
- **Dark-only.** There is no light mode and no theme control of any kind. For a brand
  positioning itself for enterprise buyers who may open the page in a bright office, and
  for older eyes that often prefer dark text on light, that is a real gap — and it is what
  the palette work below fixes.

---

## What good looks like here

The distinctive thing about this page is the momentum-driven swing. The audit's conclusion
is **not** "remove it" — it is that the animation was allowed to hold the content hostage.
Every Severity-1 finding is a variation on the same mistake: the page optimises for the
first ten seconds of delight at the cost of the next thirty seconds of understanding.

The fixes applied in the following commit keep the swing and give the words back.

---

# What was fixed

Re-measured after the changes, across **all three palettes in both themes** (six
combinations) at 1440×900, 390×844 and 320×720.

| Finding | Before | After |
|---|---|---|
| 1.1 Scroll before content | 4,140px | **1,800px** (stage 460vh → 200vh), and the headline no longer disappears |
| 1.2 No comprehension layer | — | "Which one are you?", "How it works", a 6-question FAQ, and a phone/email contact card |
| 1.3 Text below 12px | 14 elements (min 9.6px) | **0** — a `--fs-micro` floor of 13px |
| 1.4 Tap targets under 44px | 15 | **0**, excluding three prose links inside a sentence (exempt under WCAG 2.5.8) |
| 1.5 No mobile navigation | none | Burger menu, 44px trigger, 56px rows, closes on Escape and on selection |
| 2.1 Three.js in reduced mode | 589KB always | **not requested** — loaded on demand only when the scene will actually be built |
| 2.2 Contrast failures | 2 real | **0** across 130 validated token pairings |
| 2.3 Smooth scroll ungated | unconditional | wrapped in `prefers-reduced-motion: no-preference` |
| 2.4 Form labels and errors | placeholder-only, one colour | visible labels, a hint, `aria-invalid`, distinct red error / accent success with icons |
| 2.5 Sideways comparison table | 661px scroller at 320px | stacks into cards below 760px |
| 3.x Theme, favicon, meta | dark only, neither | light + dark with a toggle, favicon, live `theme-color` |

## How the intro was kept

The animation was not cut down to a thumbnail. It still runs the full three phases with
the same momentum-driven spring. What changed is that it no longer holds the content
hostage:

- The full hero hands off to a **persistent rail** at bottom-left carrying the headline,
  a one-line summary, and a live CTA. Verified at 35%, 55% and 80% through the sequence:
  there is never a frame with no words on it.
- A **"Skip the intro ↓"** button sits at bottom-right the entire time — visible, not a
  keyboard-only skip-link.
- A **progress bar** across the top answers "how much more of this is there?".

## A note on the two remaining automated warnings

Any future run of `tools/` or an external checker will still report:

1. **`.hero__title em` at ratio 1.0.** This is gradient text (`background-clip:text`), so
   the computed colour is `transparent`. Verified by hand at ≥15:1 in every palette.
2. **Two `<h1>` elements.** One is inside the animated stage, one inside the reduced-motion
   twin, and `display:none` means only ever one is in the accessibility tree. Confirmed:
   `h1visible: 1` at every breakpoint.

Both are known and neither is a defect.

## Palette validation

`node tools/contrast.js` checks **130 token pairings** — every foreground against every
ground it can actually sit on, including the sunken ground used by insets and table heads
— across all six palette/theme combinations. It exits non-zero on any failure, so a
palette edit that breaks contrast fails loudly instead of shipping.

Two source colours cannot carry text on their light grounds and are encoded in the tool as
fill-only, with a readable sibling used wherever the colour has to mean something:

| Palette | Source colour | On its light ground | Text sibling |
|---|---|---|---|
| Modern Wellness | Sage `#9DC183` | 2.0:1 — fill only | `#456B2E` (5.3:1) |
| Warm Tradition | Burnished gold `#C5B358` | 1.8:1 — fill only | `#6E6019` (4.9:1) |

Three further source colours needed adjusting rather than replacing: teal `#008080` →
`#007070` and forest green `#228B22` → `#1B6F1B` to clear 4.5:1 on their own grounds, and
copper `#B87333` → `#D4924F` on Heritage's dark slate cards. In every case the source
colour is retained for large fills; only the text variant moved.

---

# Round 2 — swing physics and the 3D bell

Prompted by hands-on review of the shipped swing: the arc read better than the pre-audit
build but still felt numerically off, the burst read as sparse, the caption text visibly
swung with the bell, and the bell itself was a stylised blob rather than the vintage
competition kettlebell in `Kettlebell Images/`. Fixed in `js/main.js` and
`js/swing-scene.js`; nothing here touches markup, palettes, or contrast.

## 2.1 The spring stepping could ring on a dropped frame or a fast flick

`js/main.js`'s swing was semi-implicit Euler integration: `angVel += (target-angle)*k*dt
- angVel*c*dt`. `dt` is capped at 0.05s for a stalled frame, and `k` climbs to 48 as the
swing progresses — at that combination Euler stepping is at the edge of numerical
stability, so a stutter or a hard flick could make the bell overshoot and wobble instead
of settling.

Replaced with `springStep()`: the exact closed-form solution for a damped harmonic
oscillator (`x'' + c·x' + k·x = 0`), the same class of solution used by CASpringAnimation
and by spring libraries like `wobble`. It is stable for any `dt`, so the settle behaves
identically regardless of frame rate. Same spring constants throughout — this changed the
integration method, not the tuning.

Separately, the raw scroll delta that gets injected as a velocity kick each frame is now
passed through a light exponential smoothing pass (`smoothDScroll`) before use. Native
wheel/trackpad deltas arrive in noisy, uneven bursts; feeding that straight into angular
velocity was reading as jitter rather than momentum.

Verified with a hard flick-scroll test, screenshotted at 0/200/400/700/1200ms after
release: the bell decelerates and settles with no pop, no overshoot glitch, no stutter.

## 2.2 The caption text inherited the bell's lean

`#stageTilt`'s rotateZ/rotateX/translate3d transform — meant to give the canvas and its
glow trail a sense of camera-attached parallax — was being applied to the whole stage,
including `#heroCopy` and the three `.hook` captions. During the swing's steepest angles
this read as the words themselves swinging, which fights legibility for the one thing on
screen guaranteed to always have text on it.

Moved `#heroCopy` and `.stage__layer--hooks` out of `#stageTilt` to be siblings of it
inside `.stage__sticky` (`src/page.html`) — same absolute-positioned layout, so nothing
shifts on screen, but the text no longer inherits the tilt. Canvas, trail, the outlined
2D mark, the wipe, and the burst-line SVG stay inside `#stageTilt` and keep swinging;
only the words are stalled. Confirmed frame-by-frame: the bell swings to its full angle
right beside dead-level, horizontally stable captions.

## 2.3 The data-node burst read as sparse

1,100 particles fading in and out together, no per-node variation. Bumped to 1,700 and
gave each one its own twinkle: a random phase/speed pair (`pTwinklePhase`,
`pTwinkleSpeed`) modulates its brightness independently every frame, so the burst reads
as scattered glinting nodes rather than a flat cloud brightening and dimming in lockstep.
`refreshPalette()` (the live re-tint on palette/theme switch) was updated to write into
the new base-colour buffer (`pBaseCol`) rather than the display buffer directly — otherwise
the next frame's twinkle math would have overwritten a palette switch within one frame.

## 2.4 The kettlebell didn't match the reference photography

Three vintage competition kettlebells were supplied as reference
(`Kettlebell Images/`): a rounder, shorter-necked body than the shipped bell, a thick
handle that visibly forges into the body at both roots rather than a thin ring resting on
top, and heavy surface wear — green/teal paint chipped through to rust and bare iron,
with a stamped weight number.

**Body profile.** The original `LatheGeometry` profile tapered continuously from its
widest point all the way to the neck — an egg silhouette, not the round-bodied, short-neck
shape in the photos. Rewritten with a distinct peak radius and continuous curvature
(no flat-radius run anywhere in the curve), giving a genuinely rounded belly instead of
a barrel-with-tapered-ends.

**The open-top defect.** `LatheGeometry` only auto-caps a revolved surface where the
profile's endpoint radius is exactly 0 — same mechanism that closes the flat base (two
points at the same height, radii 0 and R). The *original* profile's final point was
`[0.46, 2.08]`, non-zero, so the neck's top was never actually closed; it was small and
tucked behind the old thin handle, so it went unnoticed. Reshaping the body for a rounder
profile exposed that same latent hole as a visible black gap straight through the
geometry at the neck. Fixed the same way the base is capped: added a matching closing
point `[0.00, 2.08]` at the same height.

**The handle.** Added `taperTube()`, a post-process that displaces each ring of a
`TubeGeometry`'s vertices radially from the path's own centerline by a per-position
scale factor — so the handle is thick at both roots and slims to a comfortable grip at
the top, instead of a constant-radius rod. On its own this exposed a second problem: a
tube sweeps its circular cross-section along the path's Frenet frame, which doesn't align
with the lathe body's surface normal at the root, so no amount of flare produced a clean
blend — one side would show a visible hard ridge where the two surfaces met. Fixed by
adding a small filler sphere at each root (`collarGeo`, sized to just cover the tube's
actual seam ring, not larger), which buries the seam the way a real casting's shoulder is
one continuous piece of iron rather than two shapes touching. The handle roots were also
narrowed (were positioned outside the new, slimmer neck radius; narrowed to sit inside it)
so the tube overlaps solid body instead of floating past its edge.

**Surface.** Replaced the flat single-color material with `buildWeatherMap()`: a
canvas-painted texture layering rust-orange blotches and muted teal/green paint patches
over a near-black iron base, fine per-pixel grain, and a stamped weight-number medallion —
painted directly onto the lathe's own UVs (u = around, v = bottom-to-top), so it wraps
once around the body rather than tiling. The existing noise-based bump/roughness map is
unchanged and layers underneath it. Still 100% canvas-generated, zero binary image
assets — consistent with how `buildBumpMap()` already worked.

Verified across the full swing sequence in Chrome at rest, mid-arc, and through the
burst/hand-off, in both the default and hard-flick scroll cases: no console errors, no
geometry artifacts, no visible seam or gap at either handle root.
