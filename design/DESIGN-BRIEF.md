# StudyLoop premium design brief (for design consultants)

StudyLoop is a local-first video study app whose UI deliberately hugs YouTube's
watch page (reference: design/reference-youtube.png; current state: design/v2-a-home.png,
v2-a-watch.png, v2-b-upnext.png, v2-c-analysis.png; code: web/src/**/*.module.css,
web/src/index.css).

Owner verdict on the current state: functional but NOT premium — emoji glyphs used
as icons (✎ 📷 ✨ 🔖 ↗ ⤓ 👁 ⚙ ⛶), flat surfaces everywhere, no elevation system,
no micro-interactions, default scrollbars, abrupt state changes.

## Deliverable
A concrete, implementable design upgrade spec. NOT vague principles — every
recommendation must name the CSS/markup change. Cover:

1. **Icon system** — replace every emoji with inline SVG (Material-style 24px grid,
   ~2px stroke or filled, matching YouTube's icon language). Enumerate the needed
   icon set with a suggested source strategy (hand-rolled path data acceptable; no
   external font/CDN allowed — app is offline-first, CSP-strict).
2. **Surface & elevation system** — layered dark surfaces (bg / raised / overlay /
   popover), border treatments, shadow scale. YouTube dark uses #0f0f0f/#212121/
   #282828 layering — propose exact tokens as CSS variables.
3. **Micro-interactions** — hover/active/focus states for every interactive element
   (pills, cards, rail rows, seek bar, pins/diamonds, tabs), transition timing
   tokens, press feedback, YouTube-style ripple or acceptable lightweight substitute.
4. **Typography** — scale, weights, letter-spacing for title/meta/body/labels.
5. **Component-level polish passes** — player chrome, seek bar (hover thumb growth,
   heatmap curve rendering), notation modal, compile modal, concept ticker cards,
   right-rail cards, bubbles rail, toasts, empty states, loading skeletons,
   custom scrollbars, focus-visible rings.
6. **Motion** — panel expand/collapse, ticker slide-in, modal enter/exit; duration/
   easing tokens; prefers-reduced-motion handling.

Rank recommendations P0 (must, defines premium feel) / P1 (strong) / P2 (nice).
Be opinionated and specific. Assume plain CSS modules (no component libs, no
Tailwind). Output markdown.
