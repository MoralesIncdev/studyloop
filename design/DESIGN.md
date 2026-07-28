# StudyLoop Design System — ADJUDICATED SPEC (binding)

Two consultant specs were produced independently and cross-validate heavily:
- `design/design-spec-codex.md` (codex — complete: tokens, icons, typography,
  interaction, per-component polish, motion, priority plan, acceptance criteria)
- `design/design-spec-kimi.md` (kimi — tokens, full icon inventory WITH ready
  SVG path data, state-overlay model, micro-interactions, typography; truncated
  after §4)

## Adjudication (what to implement)

**Backbone: follow `design-spec-codex.md` end-to-end** — its §1 foundation
tokens, §2 icon system component API, §3 typography, §4 interaction system,
§5 component polish (ALL P0s + P1s; P2s optional), §6 motion, §7 priority plan,
and its acceptance criteria are the deliverable.

**Kimi overrides/additions to fold in:**
1. **Icon path data**: use kimi's §2 hand-rolled `<symbol>` path data as the
   starting set (Material-style, Apache-2.0 heritage — add an attribution line in
   README). Wrap in codex's `<Icon name size />` React component API (no sprite
   in index.html; a single `icons.tsx` module exporting path data + component,
   tree-shaken). Any icon codex needs that kimi's table lacks: hand-roll in the
   same 24px grid style.
2. **State overlays**: adopt kimi's `--hover-overlay / --active-overlay /
   --pressed-overlay` tokens; implement hover/pressed states as overlay
   compositing (`background: color-mix(...)` or layered pseudo-element) rather
   than per-component hardcoded hover colors — codex's per-component hover
   values become fallbacks only where overlays don't fit.
3. **Spring easing**: add kimi's `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`
   and use it for the concept-ticker slide-in and toast entrance only (subtle
   overshoot; everything else uses codex's standard/decel curves).
4. **Global focus-visible rule + reduced-motion block**: kimi's §1 versions
   (they're global and simpler); codex's per-component focus notes still apply
   where they add specificity.

**Conflict resolutions:**
- Surface stack: codex's (finer: bg #0f0f0f · raised #181818 · overlay #212121 ·
  popover #282828 · hover #3f3f3f) — kimi's coarser stack maps onto it.
- Shadows: codex's shadow-1..3 + shadow-player (includes hairline ring — reads
  more premium on pure-dark).
- Scrollbars: codex's 8px auto-hiding variant.
- Duration tokens: codex's names (press/fast/standard/panel/modal).

**Hard rules (owner directive):**
- ZERO emoji glyphs anywhere in the UI after this pass (includes toasts, empty
  states, titles, tooltips). Text labels keep sentence case.
- Every interactive element must have distinct hover, active/pressed, and
  focus-visible states with tokenized transitions.
- No external fonts, CDNs, or icon fonts — CSP-strict, offline-first.
- The video player stays visually dominant; chrome never competes with content.
- `prefers-reduced-motion` fully honored.
