# StudyLoop premium design upgrade spec

The right direction is “YouTube-native, study-tool precise”: preserve the familiar watch-page geometry and restrained palette, but add depth, consistent feedback, and a distinctive visualization layer for notes, concepts, and analysis. Do not introduce gradients, glassmorphism, neon glows, or decorative color.

## 1. Foundation tokens

### P0 — Replace the current root variables

Update `web/src/index.css`:

```css
:root {
  color-scheme: dark;

  /* Surfaces */
  --surface-bg: #0f0f0f;
  --surface-player: #000;
  --surface-raised: #181818;
  --surface-overlay: #212121;
  --surface-popover: #282828;
  --surface-hover: #3f3f3f;
  --surface-pressed: #4a4a4a;
  --surface-scrim: rgb(0 0 0 / 72%);

  /* Borders */
  --border-hairline: rgb(255 255 255 / 8%);
  --border-subtle: #303030;
  --border-default: #3f3f3f;
  --border-strong: #525252;

  /* Text */
  --text-primary: #f1f1f1;
  --text-secondary: #aaa;
  --text-tertiary: #717171;
  --text-disabled: rgb(241 241 241 / 38%);

  /* Semantic */
  --accent-blue: #3ea6ff;
  --accent-red: #ff0033;
  --accent-green: #4bb779;
  --accent-amber: #e0a83e;
  --danger: #ff5c5c;

  /* Elevation */
  --shadow-1:
    0 1px 2px rgb(0 0 0 / 42%),
    0 0 0 1px rgb(255 255 255 / 2%);
  --shadow-2:
    0 4px 12px rgb(0 0 0 / 46%),
    0 1px 2px rgb(0 0 0 / 36%);
  --shadow-3:
    0 12px 32px rgb(0 0 0 / 58%),
    0 2px 8px rgb(0 0 0 / 32%);
  --shadow-player:
    0 8px 28px rgb(0 0 0 / 42%);

  /* Geometry */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  /* Motion */
  --duration-press: 70ms;
  --duration-fast: 120ms;
  --duration-standard: 180ms;
  --duration-panel: 240ms;
  --duration-modal: 280ms;

  --ease-standard: cubic-bezier(.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0, 0, .2, 1);
  --ease-exit: cubic-bezier(.4, 0, 1, 1);

  /* Focus */
  --focus-ring:
    0 0 0 2px var(--surface-bg),
    0 0 0 4px var(--accent-blue);

  --topbar-height: 56px;

  /* Temporary compatibility during migration */
  --bg: var(--surface-bg);
  --bg-elevated: var(--surface-overlay);
  --bg-chip: var(--surface-popover);
  --bg-hover: var(--surface-hover);
  --border: var(--border-default);
  --text: var(--text-primary);
  --text-dim: var(--text-secondary);
  --accent: var(--accent-blue);
  --success: var(--accent-green);
  --warn: var(--accent-amber);
  --red: var(--accent-red);
  --radius-card: var(--radius-md);
}
```

Surface assignment must be consistent:

- Page background: `--surface-bg`
- Rail cards and bottom dock: `--surface-raised`
- Modals and side panels: `--surface-overlay`
- Dropdowns, menus, tooltips, ticker cards and toasts: `--surface-popover`
- Player: `--surface-player`
- Hover is an interaction state, never a permanent card background.

Avoid placing `--surface-overlay` cards on another `--surface-overlay` container. Use either a hairline border or elevation—not both at maximum strength.

### P0 — Global focus and disabled states

Add to `index.css`:

```css
:where(
  button,
  input,
  textarea,
  select,
  [role="button"],
  [role="slider"],
  [tabindex]
):focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

:where(button, [role="button"]):disabled {
  color: var(--text-disabled);
}

:where(button, [role="button"]) {
  -webkit-tap-highlight-color: transparent;
}
```

Remove component rules such as `outline: 1px solid var(--accent)` from inputs. They produce inconsistent rings and insufficient separation from the dark background.

---

## 2. Icon system

### P0 — Add a local inline-SVG icon layer

Create:

- `web/src/components/Icon.tsx`
- `web/src/components/Icon.module.css`
- `web/src/icons/paths.ts`

Vendor only the required Material Symbols Rounded or Material Icons path data into `paths.ts`. Material assets may be selected during development, but the runtime must make no network request and must not depend on an icon font or CDN.

```tsx
export type IconName =
  | "play" | "pause"
  | "volumeHigh" | "volumeOff"
  | "search" | "settings"
  | "editNote" | "camera"
  | "autoAwesome"
  | "closedCaption"
  | "fullscreen" | "fullscreenExit"
  | "close"
  | "bookmark"
  | "share" | "download"
  | "visibility" | "visibilityOff"
  | "notifications" | "notificationsOff"
  | "chevronUp" | "chevronDown"
  | "refresh"
  | "check"
  | "star" | "starOutline"
  | "delete"
  | "edit"
  | "noteAdd"
  | "folderOpen"
  | "copy"
  | "arrowBack";

export function Icon({
  name,
  size = 24,
  className
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
```

Rules:

- All icons use a 24×24 view box.
- Filled Material paths are preferred for player controls.
- Any stroked custom icon uses `stroke="currentColor"`, `strokeWidth={2}`, `strokeLinecap="round"` and `strokeLinejoin="round"`.
- Icons inherit `currentColor`.
- Standard visual size: 24px.
- Compact row actions: 18–20px.
- Minimum button hit area: 40×40px; use 44×44px where layout permits.
- The accessible name remains on the parent button. Decorative SVGs are `aria-hidden`.

### P0 — Replace every current glyph

| Current glyph | Replacement |
|---|---|
| `▶`, `⏸` | `play`, `pause` |
| `🔇`, `🔊` | `volumeOff`, `volumeHigh` |
| `✎` | `editNote` |
| `📷` | `camera` |
| `✨` | `autoAwesome` |
| `CC` used as an icon | `closedCaption`; retain visible “CC” only inside the SVG |
| `⚙` | `settings` |
| `⛶` | `fullscreen` / `fullscreenExit` |
| `✕`, `×` used as close controls | `close` |
| `🔖` | `bookmark` |
| `↗` | `share` |
| `⤓` | `download` |
| `👁` | `visibility` / `visibilityOff` |
| `🔔`, `🔕` | `notifications`, `notificationsOff` |
| `🔍` | `search` |
| `▲`, `▼` | `chevronUp`, `chevronDown` |
| `⟳` | `refresh` |
| `✓` | `check` |
| `★`, `☆` | `star`, `starOutline` |
| text-only edit/delete actions | `edit`, `delete` where space is constrained |

Update at minimum:

- `PlayerControls.tsx`
- `AnalyzeButton.tsx`
- `RightRail.tsx`
- `CompileFlow.tsx`
- `ImportOverlayFlow.tsx`
- `ShareFlow.tsx`
- `OverlaysToggle.tsx`
- `BubbleRail.tsx`
- `NotationModal.tsx`
- `ConceptCard.tsx`
- `ConceptOverlay.tsx`
- `ConceptsDock.tsx`
- `AnalysisSections.tsx`
- `ToastHost.tsx`
- `TopBar.tsx`
- `LibraryView.tsx`

The instructional copy in `SettingsView.tsx` must also change from “✨ Analyze pipeline” to “Analyze pipeline”; UI copy must not depend on icon glyphs.

Use icon-plus-label for StudyLoop-specific actions such as Note, Shot, Analyze and Compile outside the player. Inside the player, use icon-only buttons with `aria-label` and tooltips.

---

## 3. Typography

### P0 — Establish one explicit scale

Keep the YouTube-compatible sans-serif direction. Bundle local Roboto WOFF2 files if licensing/assets permit; otherwise retain the current fallback stack without a CDN.

```css
:root {
  --font-sans: "Roboto", "Arial", -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  --type-11: 11px;
  --type-12: 12px;
  --type-13: 13px;
  --type-14: 14px;
  --type-16: 16px;
  --type-18: 18px;
  --type-20: 20px;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-bold: 700;
}
```

Apply:

| Role | CSS |
|---|---|
| Watch title | `20px/28px`, weight 700, `letter-spacing:-0.01em` |
| Page/settings title | `20px/28px`, weight 700 |
| Rail/card heading | `14px/20px`, weight 500 |
| Video/card title | `14px/20px`, weight 500 |
| Primary body | `14px/20px`, weight 400 |
| Dense transcript/body | `13px/19px`, weight 400 |
| Metadata | `12px/17px`, weight 400, secondary text |
| Pills/buttons | `13px/18px`, weight 500 |
| Section labels | `11px/16px`, weight 500, `letter-spacing:.06em` |
| Time values | `12px/16px`, tabular numerals |
| Tooltip | `12px/16px`, weight 500 |

Change `.StudyView .title` from 18/600 to 20/700. Do not increase rail density: its current 13–14px scale is appropriate, but normalize weights and line heights.

Use `text-wrap: pretty` on modal headings and empty-state copy. Use `font-variant-numeric: tabular-nums` on all durations, timestamps, playback rates, counts and percentages.

---

## 4. Interaction system

### P0 — Shared state behavior

Every interactive control must implement:

- Hover: color/background transition in 120ms.
- Active: `transform: scale(.96)` for icon buttons and `.98` for pills/cards.
- Focus-visible: the global double ring.
- Disabled: no hover transform; 38% foreground opacity; cursor `default`.
- Selected/toggled: persistent background or foreground change plus `aria-pressed`.
- Cursor hit areas must be larger than the visible pin, icon or diamond.

Base pattern:

```css
.interactive {
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-press) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.interactive:active:not(:disabled) {
  transform: scale(.96);
}
```

### P1 — Lightweight ripple

Add `data-ripple` to primary pills, circular toolbar buttons, menu items and modal actions. Do not apply it to video cards or seek markers.

```css
button[data-ripple] {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

button[data-ripple]::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: radial-gradient(circle, currentColor 0 10%, transparent 11%);
  opacity: 0;
  transform: scale(.25);
  transition:
    transform 260ms var(--ease-enter),
    opacity 180ms var(--ease-exit);
}

button[data-ripple]:active::after {
  opacity: .13;
  transform: scale(3);
  transition-duration: 0ms;
}
```

This is intentionally centered and CSS-only. It provides Material/YouTube-style press feedback without pointer-position JavaScript.

### State specifics

| Element | Required behavior |
|---|---|
| Pills | Hover `--surface-hover`; active scale `.98`; selected uses primary text on a light surface or blue-tinted background |
| Icon buttons | Circular 40×40 hit area; hover `rgb(255 255 255 / 12%)`; active `.94` |
| Video/rail cards | Hover background only; remove the current `scale(1.015)` from `upNextCard`, which causes visual jitter |
| Tabs | Hover foreground; active 2px underline; focus ring around the complete tab |
| Transcript rows | Hover surface; active blue-tinted surface and 3px indicator; press translateX(1px) |
| Inputs | Border strong on hover; blue border plus focus ring on focus; placeholder tertiary |
| Seek markers | 16×20 transparent hit target; visible marker grows 1.25× |
| Destructive actions | Danger color appears on hover/focus, not permanently |

---

## 5. Component polish

### Player chrome — P0

Files: `PlayerChrome.module.css`, `PlayerControls.module.css`, `PlayerControls.tsx`.

- Increase bottom scrim reach from 40px to 96px.
- Use a multi-stop gradient so controls feel embedded in the video:

```css
.scrim {
  padding: 72px 12px 0;
  background: linear-gradient(
    to top,
    rgb(0 0 0 / 92%) 0,
    rgb(0 0 0 / 68%) 38%,
    rgb(0 0 0 / 24%) 72%,
    transparent 100%
  );
  transition:
    opacity var(--duration-standard) var(--ease-standard),
    transform var(--duration-standard) var(--ease-standard);
}
```

- Player control buttons become 40×40 with 24px SVGs.
- Add a subtle `text-shadow: 0 1px 2px #000` to time text and control icons.
- Animate volume width from `0` to `72px` when the volume cluster is hovered or focused within.
- Replace the native-looking range slider with explicit track and thumb styles.
- Settings menu uses `--surface-popover`, `--shadow-3`, `--radius-md`.
- Settings-menu items need roving keyboard focus or normal tab focus; add `aria-checked` to the selected rate.
- Use a proper tooltip component for icon-only controls after 450ms hover/focus. The current native `title` attributes may remain temporarily but should not be the final presentation.

### Seek bar and heatmap — P0

Files: `SeekBar.tsx`, `SeekBar.module.css`, `HeatmapStrip.tsx`, `HeatmapStrip.module.css`.

- Keep the idle track at 3px and hover/focus track at 5px.
- Render the playhead at 12px on hover and 14px while dragging.
- Track should also expand under `:focus-visible` and a `data-dragging="true"` state, not hover alone.
- Replace width-changing pin hover rules with transforms to prevent positional movement.
- Add `data-kind` and `data-active` attributes to markers rather than relying on overlapping classes.

```css
.playhead {
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%) scale(0);
}

.track:hover .playhead,
.track:focus-visible .playhead,
.track[data-dragging="true"] .playhead {
  transform: translate(-50%, -50%) scale(1);
}

.track[data-dragging="true"] .playhead {
  transform: translate(-50%, -50%) scale(1.16);
}

.bubblePin,
.conceptTick,
.pearlMarker {
  transition:
    transform var(--duration-fast) var(--ease-standard),
    filter var(--duration-fast) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard);
}

.bubblePin:hover,
.bubblePin:focus-visible,
.conceptTick:hover,
.conceptTick:focus-visible {
  transform: scaleX(1.5) scaleY(1.2);
}
```

- Pins and diamonds should be real `<button>` elements positioned on the slider, not non-focusable `div`s. Give each an `aria-label` with type, timestamp and label.
- Preserve the distinct visual grammar:
  - Amber vertical pin: user bubble.
  - Green lower tick: concept.
  - Blue diamond: analysis pearl.
  - White line: A/B loop boundary.
- Add tooltip entry motion: opacity plus 4px translateY, 120ms.
- Clamp tooltips within the track using a calculated `--tooltip-x` or `clamp()`; they currently can overflow at 0% and 100%.

For the heatmap, keep SVG rather than approximating the curve with CSS. Add an SVG `linearGradient` and use it for the area:

```tsx
<defs>
  <linearGradient id="heatmapFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="currentColor" stopOpacity=".46" />
    <stop offset="1" stopColor="currentColor" stopOpacity=".08" />
  </linearGradient>
</defs>
```

```css
.strip {
  height: 32px;
  color: var(--text-primary);
  opacity: .86;
}

.area {
  fill: url("#heatmapFill");
}

.line {
  stroke: rgb(255 255 255 / 58%);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
```

Use a smoothed curve generator in `HeatmapStrip.tsx`—Catmull–Rom converted to cubic Bézier or monotone cubic interpolation—rather than straight point-to-point segments. Do not add glow.

### Right rail — P0

Files: `RightRail.tsx`, `RightRail.module.css`, `TranscriptPane.module.css`, `ConceptsDock.module.css`.

- Change `.card` to `--surface-raised`, `--border-hairline`, `--shadow-1`.
- Header hover should use `rgb(255 255 255 / 6%)`, not the full `#3f3f3f`.
- Replace conditional unmounting of expanded bodies with a persistent wrapper:

```tsx
<div className={styles.expandRegion} data-open={expanded}>
  <div className={styles.expandInner}>{children}</div>
</div>
```

```css
.expandRegion {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--duration-panel) var(--ease-standard),
    opacity var(--duration-standard) var(--ease-standard);
}

.expandRegion[data-open="true"] {
  grid-template-rows: 1fr;
  opacity: 1;
}

.expandInner {
  min-height: 0;
  overflow: hidden;
}
```

- Chevron rotates 180° instead of switching triangle characters.
- Remove the Up Next `scale(1.015)`. Use background plus thumbnail brightness:
  `filter: brightness(1.08)` and `transform: translateY(-1px)`.
- Keep thumbnail dimensions stable at 168×94.
- Transcript active rows should use an 8% blue tint and a 3px blue indicator; hover only 5% white.
- Search boxes use `--surface-bg` inside raised cards.
- Collapse empty rail sections entirely unless they contain an actionable recovery control.

### Notation modal — P0

Files: `NotationModal.tsx`, `NotationModal.module.css`.

Restructure the dialog:

```tsx
<div className={styles.overlay} data-state="open">
  <form className={styles.card} onSubmit={handleSave}>
    <header className={styles.header}>
      <div>
        <h2>Add notation</h2>
        <span className={styles.timestamp}>33:19</span>
      </div>
      <button aria-label="Close"><Icon name="close" /></button>
    </header>
    <div className={styles.content}>…</div>
    <footer className={styles.actions}>…</footer>
  </form>
</div>
```

Specific changes:

- Card background: `--surface-overlay`.
- Card border: `--border-hairline`.
- Shadow: `--shadow-3`.
- Radius: 16px.
- Width: `min(640px, calc(100vw - 32px))`.
- Preview column: 220px desktop; full-width 16:9 preview under 620px.
- Add an explicit heading and close button; Escape remains supported.
- Quote should lose the current “card plus colored left border” treatment. Use a quiet inset surface with quotation marks and a 1px hairline.
- Place concept reference above the quote as a compact removable chip.
- Footer gets a top border and separate surface so actions do not float inside the form.
- Primary Save button receives a spinner SVG and `aria-busy`.
- Add focus trapping and restore focus to the invoking control on close.
- Backdrop click may close only when no save/capture operation is pending.

### Compile and import/share modals — P0

Files: `CompileFlow.tsx`, `CompileFlow.module.css`, `ImportOverlayFlow.tsx`, `ShareFlow.tsx`.

- Use the same modal shell as Notation instead of duplicating overlay/card/button styling.
- Extract `ModalShell.module.css` or shared global component classes.
- Caption rows use `--surface-raised`; thumbnail and input should align to a 48px minimum row height.
- Add visible progress stages: “Captions → Compile → Ready” only when those stages genuinely exist. Do not add decorative steps.
- Preview body uses `--surface-bg`, inset border and its own scrollbar.
- Long paths should be selectable, single-line by default, with a Copy icon action.
- Close actions use SVG.
- All async primary buttons use `aria-busy`, spinner icon, and stable width so labels do not shift.

### Concept ticker — P1

Files: `ConceptCard.module.css`, `ConceptTicker.module.css`.

- Remove the current 3px green left border; it reads like a generic alert card.
- Use a 6px success dot beside the title and a restrained top metadata row.
- Surface: `--surface-popover`.
- Border: `--border-hairline`.
- Shadow: `--shadow-2`.
- Width: 280px.
- Body padding: 12px 36px 12px 14px.
- Card hover: translateY(-1px), `--shadow-3`.
- Dismiss button: 32×32 hit target with a 20px close icon.
- Limit visible stack to three; older cards collapse into the existing “+N more” control.
- New cards enter with 12px horizontal movement and opacity. Existing cards shift vertically using transform transitions.
- Ticker must sit above player controls only when chrome is hidden; when chrome appears, transition its bottom offset from 12px to 72px.

### Bubble rail — P1

Files: `BubbleRail.tsx`, `BubbleRail.module.css`.

- Use `--surface-raised` rows, hairline borders, 10px radius.
- Increase thumbnails from 64×36 to 80×45.
- Make the whole content area clickable to seek; keep edit/delete as explicit buttons.
- Hide row actions until row hover/focus-within:

```css
.itemActions {
  opacity: 0;
  transform: translateX(4px);
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.item:hover .itemActions,
.item:focus-within .itemActions {
  opacity: 1;
  transform: none;
}
```

- Keep timestamp as a blue chip, but reduce the tint to 10%.
- Replace text-glyph actions with 20px Edit, Note Add and Delete icons.
- Deleted rows should fade and collapse over 180ms before state removal.

### Library cards and empty states — P1

Files: `LibraryView.module.css`, `LibraryView.tsx`.

- Do not treat every video card as an elevated panel. Preserve YouTube’s flat cards.
- Add thumbnail elevation only: `box-shadow: var(--shadow-1)`.
- Card hover lifts the thumbnail 2px and brightens it; title changes to primary white.
- Remove the purple/blue placeholder gradient. Use `--surface-raised` plus a centered local Video icon or generated thumbnail.
- Empty state uses a 48px outline video/library icon, one heading, one sentence and one primary CTA. No emoji, illustration, or gradient.
- Reduce empty-card border prominence to `--border-hairline`.

### Toasts — P1

Files: `ToastHost.tsx`, `ToastHost.module.css`.

- Use `--surface-popover`, `--shadow-3`, 10px radius.
- Add a semantic SVG: check, warning/info, or error.
- Do not color the full border. Use a semantic 3px indicator or semantic icon.
- Minimum height: 48px.
- Add exit state before removal:

```css
.toast[data-state="entering"] {
  animation: toast-in 180ms var(--ease-enter);
}

.toast[data-state="exiting"] {
  animation: toast-out 140ms var(--ease-exit) forwards;
}
```

- Pause auto-dismiss while hovered or keyboard-focused.
- Keep `aria-live="polite"` for informational/success messages; errors should use `role="alert"`.

### Loading skeletons — P1

Create a reusable `Skeleton.module.css`.

Use skeletons for:

- Library thumbnail/title/meta.
- Transcript rows.
- Related-video rows.
- Concept-analysis sections.
- Screenshot capture preview.

```css
.skeleton {
  border-radius: var(--radius-xs);
  background: linear-gradient(
    90deg,
    rgb(255 255 255 / 5%) 20%,
    rgb(255 255 255 / 10%) 38%,
    rgb(255 255 255 / 5%) 56%
  );
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.4s linear infinite;
}
```

Skeletons must match final geometry to avoid layout shift. Do not use a spinner for list loading; reserve spinners for short, blocking operations such as saving or capturing a frame.

### Custom scrollbars — P0

The current global scrollbar remains visually heavy. Replace it with:

```css
* {
  scrollbar-width: thin;
  scrollbar-color: #606060 transparent;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  min-height: 32px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: #606060;
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background: #8a8a8a;
  background-clip: padding-box;
}
```

For the transcript, concepts and modal preview, the thumb should remain hidden until the region is hovered or focused if browser support permits. Do not reduce below an effective 4px painted width.

---

## 6. Motion system

### P0 — Required motion

| Event | Duration | Easing | Motion |
|---|---:|---|---|
| Button hover | 120ms | standard | color/background |
| Button press | 70ms | standard | scale |
| Tooltip | 120ms | enter/exit | opacity + 4px Y |
| Rail expand | 240ms | standard | grid rows + opacity |
| Ticker entry | 180ms | enter | 12px X + opacity |
| Ticker removal | 140ms | exit | 8px X + opacity |
| Modal backdrop | 180ms | enter | opacity |
| Modal card enter | 280ms | enter | opacity + 12px Y + `.98→1` scale |
| Modal exit | 180ms | exit | opacity + 8px Y + `.99` scale |
| Side panel | 240ms | standard | translateX |
| Toast | 180ms | enter | 8px Y + opacity |

Modal CSS:

```css
.overlay[data-state="opening"] {
  animation: backdrop-in 180ms var(--ease-enter) both;
}

.card[data-state="opening"] {
  animation: modal-in var(--duration-modal) var(--ease-enter) both;
}

.card[data-state="closing"] {
  animation: modal-out 180ms var(--ease-exit) both;
}

@keyframes modal-in {
  from { opacity: 0; transform: translateY(12px) scale(.98); }
  to   { opacity: 1; transform: none; }
}

@keyframes modal-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: translateY(8px) scale(.99); }
}
```

Current conditional rendering removes modals and panels before exit animation can run. Add a small `usePresence(open, 180)` helper or maintain `data-state="closing"` until `animationend`.

### P0 — Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }

  .skeleton {
    animation: none;
    background: rgb(255 255 255 / 7%);
  }
}
```

Do not disable state changes, focus rings, loading indication, or expanded/collapsed visibility—only their animation.

---

## 7. Priority plan

### P0 — Defines the premium feel

1. Introduce the complete surface, elevation, motion and focus tokens.
2. Replace every emoji/glyph control with local inline SVGs.
3. Normalize typography and raise the watch title to 20/700.
4. Apply complete hover, active, focus-visible and disabled states.
5. Polish player chrome, volume, settings menu and seek bar.
6. Make seek pins/diamonds keyboard-operable buttons.
7. Consolidate modal styling and add proper enter/exit behavior.
8. Animate right-rail expansion without conditional unmounting.
9. Install the custom scrollbar and reduced-motion rules.

### P1 — Strong quality gains

1. Heatmap gradient and smoothed SVG curve.
2. Ticker stacking and coordinated entry/removal.
3. Bubble row action reveal and deletion motion.
4. Toast semantic icons and exit lifecycle.
5. Skeletons matching real content geometry.
6. Library thumbnail hover and non-gradient placeholders.
7. Tooltips for all icon-only controls.
8. Focus trapping and focus restoration for dialogs.

### P2 — Nice refinements

1. Animate volume control reveal within the player cluster.
2. Clamp seek tooltips at timeline edges.
3. Pause toast timers on hover/focus.
4. Subtle thumbnail brightness changes on card hover.
5. Persist modal size/scroll state during async compile operations.
6. Add motion-aware ticker repositioning when player chrome appears.

## Acceptance criteria

The upgrade is complete only when:

- No emoji or Unicode glyph remains as an interactive icon.
- Every interactive element has visible hover, active, focus-visible and disabled behavior.
- Keyboard users can reach seek markers, ticker dismissal, rail headers and modal actions.
- Modal and panel exit animations are visible rather than cut off by unmounting.
- No component contains a new hard-coded shadow or transition duration.
- Surface assignment follows the four-layer system.
- Loading lists do not jump when real data replaces skeletons.
- `prefers-reduced-motion` removes all nonessential motion.
- The player remains visually dominant; elevation and accent color never compete with the video.
