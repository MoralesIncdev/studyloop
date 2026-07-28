## P0

1. **Player controls hardcode `#fff` and raw black instead of the agreed tokens.**  
   `PlayerControls.module.css` sets `.controls`, `.iconButton`, `.time`, `.loopBadge` to `color: #fff`; adds `text-shadow: 0 1px 2px rgb(0 0 0 / 60%)`; `index.css` defines `--surface-player: #000` outside the approved three-stop stack.  
   **Fix:** Replace all `#fff` control colors with `var(--text-primary)`, remove `#000` player surfaces or replace with `var(--surface-bg)`, and replace the text-shadow with `var(--shadow-text)` or remove it.

2. **Solid hover/pressed surface tokens corrupt the overlay state model.**  
   `index.css` defines `--surface-hover` and `--surface-pressed` as solid colors alongside the overlay tints.  
   **Fix:** Delete `--surface-hover` / `--surface-pressed` and migrate any usage to `--hover-overlay` / `--active-overlay` / `--pressed-overlay`.

3. **The loop chip starts in a hover overlay.**  
   `PlayerControls.module.css` `.loopBadge` has `background: var(--hover-overlay, rgb(255 255 255 / 10%))`, so its default state is already a hover tint.  
   **Fix:** Default background should be a surface token (`--surface-popover` or `--active-overlay`); `:hover` should step up to `--active-overlay` / `--pressed-overlay`.

4. **Sprite icon system from the spec was replaced by inline path duplication.**  
   `icons.tsx` renders the full `<path>` in every instance; no `<symbol>` / `<use>` sprite.  
   **Fix:** Create an SVG sprite sheet with `<symbol id="iconName">` and render `<svg><use href="#iconName" /></svg>`.

5. **Icon component has no accessible / informative mode.**  
   `icons.tsx` always sets `aria-hidden="true"` and never exposes a `<title>` or `role="img"`.  
   **Fix:** Add an optional `ariaLabel`/`title` prop; when provided, render `role="img"` with `<title>` and `aria-label`, otherwise keep `aria-hidden`. Every icon-only button must also carry its own `aria-label`.

6. **Global focus-visible selector omits links and common ARIA roles.**  
   `index.css` covers only buttons, inputs, and a few roles; it omits `a`, checkbox, radio, switch, menuitem, option, listbox, combobox, contenteditable.  
   **Fix:** Add `a, [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="option"], [role="listbox"], [role="combobox"], [contenteditable]` to the `:where(...)` list.

## P1

7. **Hardcoded overlay fallbacks in `PlayerControls` diverge from tokens.**  
   `.iconButton:hover` uses `var(--hover-overlay, rgb(255 255 255 / 12%))`; `:active` uses `var(--pressed-overlay, rgb(255 255 255 / 20%))`. The fallbacks do not match the token values.  
   **Fix:** Remove the fallbacks; rely on the defined overlay variables.

8. **Per-component hover hacks on `SeekBar` markers.**  
   `.bubblePin:hover` and `.conceptTick:hover` use `color-mix(in srgb, ... 80%, white)`; `.pearlMarker:hover` uses `filter: brightness(1.25)`. These are one-off hacks, not the overlay model.  
   **Fix:** Apply `background: var(--hover-overlay)` over the marker, or add a dedicated `--marker-hover` token; remove `color-mix` and `filter` hacks.

9. **Hardcoded durations in shared motion helpers.**  
   `index.css` ripple transition uses `260ms` / `180ms`; skeleton and `analyzing-pulse` use `1.4s`.  
   **Fix:** Replace with tokens: ripple `var(--duration-panel)` / `var(--duration-standard)`, add `--duration-skeleton`, and use it for skeleton and pulse.

10. **Scrollbar colors are raw hex values.**  
    `index.css` `::-webkit-scrollbar-thumb` uses `#606060`, `:hover` uses `#8a8a8a`.  
    **Fix:** Add `--scrollbar-thumb` and `--scrollbar-thumb-hover` tokens and reference them.

11. **Spring easing is defined but not used for the promised ticker/toast entry.**  
    `--ease-spring` exists in `index.css`, but `SeekBar` animations and the settings menu use `var(--ease-standard)` / `var(--ease-enter)`.  
    **Fix:** Apply `var(--ease-spring)` to toast entry and to the ticker/seek-bar value-change animation.

12. **Menu button active transforms are not transitioned.**  
    `PlayerControls.module.css` `.rateOption` and `.menuButton` set `transform: scale(.96)` on `:active` but their `transition` lists omit `transform`.  
    **Fix:** Add `transform var(--duration-press) var(--ease-standard)` to both transition declarations.

13. **Ripple effect is not suppressed under reduced motion.**  
    `index.css` still paints and scales `button[data-ripple]::after` when `prefers-reduced-motion: reduce` is active.  
    **Fix:** In the reduced-motion media query, add `button[data-ripple]::after { display: none; }`.

14. **Hardcoded seekbar track/marker colors.**  
    `SeekBar.module.css` `.track` background is `rgb(255 255 255 / 20%)`, `.loopMarker` is `#fff`, `.playhead` shadow is `rgb(0 0 0 / 30%)`.  
    **Fix:** Replace with tokens such as `var(--border-subtle)` / `var(--text-primary)` or add `--track-bg`, `--track-marker`, and `--thumb-shadow`.

## P2

15. **Icon family mixes filled and stroke icons.**  
    `icons.tsx` has all filled paths except `share`, which is a 2px stroke icon.  
    **Fix:** Convert `share` to a filled path, or expose a consistent `variant` prop and use one family per context.

16. **Stroke width does not scale with icon size.**  
    `STROKE_PATHS` always renders `strokeWidth={2}`; at smaller `size` values the icon looks too heavy.  
    **Fix:** Add `vectorEffect="non-scaling-stroke"` or compute `strokeWidth = (24 / size) * 2`.

17. **Hardcoded border-radius values.**  
    `PlayerControls.module.css` `.iconButton` uses `border-radius: 50%`; `index.css` scrollbar uses `border-radius: 999px`.  
    **Fix:** Use `var(--radius-pill)` consistently.

18. **Player text-shadow reads as a cheap emboss effect.**  
    `PlayerControls.module.css` applies `text-shadow: 0 1px 2px rgb(0 0 0 / 60%)` to `.controls`, `.iconButton`, and `.time`.  
    **Fix:** Remove the text-shadow or replace with a dedicated, subtle `--shadow-text` token.

19. **Duplicate `edit` and `editNote` paths.**  
    `icons.tsx` stores the same path data under both names.  
    **Fix:** Remove the duplicate or draw a distinct `editNote` icon.

20. **Unapproved surface token expansion outside the agreed three-stop stack.**  
    `index.css` adds `--surface-raised`, `--surface-input`, `--surface-player` with hardcoded colors not in the spec.  
    **Fix:** Remove them unless formally approved; keep only `--surface-bg`, `--surface-overlay`, `--surface-popover` plus overlay tints.
