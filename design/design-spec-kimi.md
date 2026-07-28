# StudyLoop Premium Design Upgrade Spec

> Plain CSS modules, offline-first, CSP-strict. Every recommendation names the exact selector/token/SVG change. Items are tagged **P0** (must), **P1** (strong), **P2** (nice).

---

## 1. Foundation tokens (add to `web/src/index.css`)

**Priority: P0** — these tokens are the substrate for every premium change.

Add into `:root`, then migrate the existing variables to use them.

```css
:root {
  color-scheme: dark;

  /* Existing variables remapped to a real surface stack */
  --bg: var(--surface-canvas);
  --bg-elevated: var(--surface-raised);
  --bg-chip: #272727;
  --bg-hover: #3f3f3f;
  --border: var(--border-default);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --text: #f1f1f1;
  --text-dim: #aaaaaa;
  --accent: #3ea6ff;
  --accent-contrast: #0f0f0f;
  --warn: #e0a83e;
  --success: #4bb779;
  --danger: #f44336;
  --red: #ff0033;

  /* Surfaces — YouTube dark: #0f0f0f / #212121 / #282828 */
  --surface-canvas: #0f0f0f;
  --surface-raised: #212121;
  --surface-menu: #282828;
  --surface-tooltip: #3f3f3f;
  --surface-input: #121212;
  --surface-scrim: rgba(0, 0, 0, 0.75);

  /* State overlays (applied over any surface) */
  --hover-overlay: rgba(255, 255, 255, 0.08);
  --active-overlay: rgba(255, 255, 255, 0.16);
  --pressed-overlay: rgba(255, 255, 255, 0.24);

  /* Borders */
  --border-default: rgba(255, 255, 255, 0.12);
  --border-strong: rgba(255, 255, 255, 0.2);

  /* Elevation */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 4px 8px rgba(0, 0, 0, 0.4);
  --shadow-3: 0 8px 16px rgba(0, 0, 0, 0.5);
  --shadow-4: 0 12px 24px rgba(0, 0, 0, 0.6);
  --shadow-popover: 0 8px 24px rgba(0, 0, 0, 0.55);

  /* Shape */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-card: var(--radius-md);
  --radius-pill: 999px;

  /* Motion */
  --duration-instant: 80ms;
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-emphasis: 300ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-decel: cubic-bezier(0, 0, 0.2, 1);
  --ease-accel: cubic-bezier(0.4, 0, 1, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Focus */
  --focus-ring: 0 0 0 2px color-mix(in srgb, var(--accent) 50%, transparent);

  /* Layout */
  --topbar-height: 56px;
}
```

Also update the global scrollbar and add reduced-motion handling:

```css
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border: 2px solid transparent;
  background-clip: content-box;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-dim);
  border: 2px solid transparent;
  background-clip: content-box;
}

/* Consistent focus-visible everywhere */
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[tabindex]:not([tabindex="-1"]):focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 2. Icon system — replace every emoji with inline SVG

**Priority: P0** — emoji are the #1 non-premium signal.

### Strategy

1. Create `web/src/components/icons/Icon.tsx` (or sprite).
2. Every icon is `viewBox="0 0 24 24"`, uses `currentColor`, no external CDN/font.
3. Player controls: 24px filled Material-style icons.
4. UI affordances: 20px stroke or filled depending on density.
5. Remove all `font-size` icon sizing in buttons; size via SVG `width/height`.

Implementation options (pick one):

- **Sprite (recommended)**: one hidden inline `<svg>` with `<symbol id="icon-edit">…</symbol>` in `index.html` or `<IconSprite />`. Use `<svg><use href="#icon-edit" /></svg>`.
- **React components**: one component per icon. Slightly larger bundle but easiest to tree-shake.

Either way, replace JSX like `✎` with `<Icon name="edit" size={20} />`.

### Required icon set

| Emoji | Icon | Name | Notes |
|---|---|---|---|
| ✎ | Edit / pen | `edit` | filled, 20px in pills/menus |
| 📷 | Capture frame | `camera` | filled, 20px |
| ✨ | AI / spark | `spark` | filled, 20px |
| 🔖 | Bookmark | `bookmark` | filled, 20px |
| ↗ | Open / external | `external` | 20px, 2px stroke |
| ⤓ | Download | `download` | filled, 20px |
| 👁 | View / eye | `eye` | filled, 20px |
| ⚙ | Settings | `settings` | filled, 24px in player |
| ⛶ | Fullscreen | `fullscreen` | filled, 24px in player |
| — | Play | `play` | filled, 24px |
| — | Pause | `pause` | filled, 24px |
| — | Skip next | `skipNext` | filled, 24px |
| — | Skip previous | `skipPrev` | filled, 24px |
| — | Volume high | `volume` | filled, 24px |
| — | Volume mute | `volumeMute` | filled, 24px |
| — | Loop / repeat | `loop` | filled, 24px |
| — | Chevron | `chevron` | filled, 12px, rotates 180° |
| — | Search | `search` | filled, 20px |
| — | Close | `close` | filled, 20px |
| — | Check | `check` | filled, 16px |
| — | More / vertical | `more` | filled, 24px |
| — | Person / avatar | `person` | filled, 20px fallback |
| — | Bell off | `bellOff` | filled, 16px ticker mute |

### Hand-rolled symbol definitions

Drop these into `IconSprite.tsx` / the hidden sprite:

```html
<symbol id="icon-edit" viewBox="0 0 24 24">
  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
</symbol>

<symbol id="icon-camera" viewBox="0 0 24 24">
  <path d="M9.4 10.5A4.1 4.1 0 1 0 14.6 10.5L12 8 9.4 10.5zM7 6h3.17L12 4h4l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2zm5 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/>
</symbol>

<symbol id="icon-spark" viewBox="0 0 24 24">
  <path d="M12 2l2.47 7.59L22 12l-7.53 2.41L12 22l-2.47-7.59L2 12l7.53-2.41L12 2z"/>
</symbol>

<symbol id="icon-bookmark" viewBox="0 0 24 24">
  <path d="M5 3h14a2 2 0 0 1 2 2v16l-9-4-9 4V5a2 2 0 0 1 2-2z"/>
</symbol>

<symbol id="icon-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4 0h6v6m0-12L10 14"/>
</symbol>

<symbol id="icon-download" viewBox="0 0 24 24">
  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
</symbol>

<symbol id="icon-eye" viewBox="0 0 24 24">
  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
</symbol>

<symbol id="icon-settings" viewBox="0 0 24 24">
  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.24 0 .45-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/>
</symbol>

<symbol id="icon-fullscreen" viewBox="0 0 24 24">
  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
</symbol>

<symbol id="icon-fullscreenExit" viewBox="0 0 24 24">
  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
</symbol>

<symbol id="icon-play" viewBox="0 0 24 24">
  <path d="M8 5v14l11-7z"/>
</symbol>

<symbol id="icon-pause" viewBox="0 0 24 24">
  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
</symbol>

<symbol id="icon-skipNext" viewBox="0 0 24 24">
  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
</symbol>

<symbol id="icon-skipPrev" viewBox="0 0 24 24">
  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
</symbol>

<symbol id="icon-volume" viewBox="0 0 24 24">
  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.49 4.49 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
</symbol>

<symbol id="icon-volumeMute" viewBox="0 0 24 24">
  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A9.86 9.86 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
</symbol>

<symbol id="icon-loop" viewBox="0 0 24 24">
  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
</symbol>

<symbol id="icon-chevron" viewBox="0 0 24 24">
  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
</symbol>

<symbol id="icon-search" viewBox="0 0 24 24">
  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>
</symbol>

<symbol id="icon-close" viewBox="0 0 24 24">
  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
</symbol>

<symbol id="icon-check" viewBox="0 0 24 24">
  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
</symbol>

<symbol id="icon-more" viewBox="0 0 24 24">
  <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
</symbol>

<symbol id="icon-person" viewBox="0 0 24 24">
  <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z"/>
</symbol>
```

---

## 3. Micro-interactions

**Priority: P0**

Create a shared utility module `web/src/styles/interactions.module.css` and import it wherever there are clickable surfaces.

```css
/* interactions.module.css */
.interactive {
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    transform var(--duration-instant) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.interactive:hover:not(:disabled) {
  background-color: var(--hover-overlay);
}

.interactive:active:not(:disabled) {
  transform: scale(0.97);
}

.interactive:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.interactive:disabled {
  opacity: 0.4;
  cursor: default;
}
```

Apply `composes: interactive from '../styles/interactions.module.css';` (or merge the properties) to:

- `PlayerControls.module.css` `.iconButton`, `.loopBadge`, `.rateOption`, `.menuButton`
- `StudyView.module.css` `.analyzePill`, `.pillButton`, `.primaryButton`, `.secondaryButton`
- `RightRail.module.css` `.cardHeader`, `.upNextCard`, `.tickerMuteButton`
- `TopBar.module.css` `.wordmark`, `.searchButton`, `.avatarButton`, `.dropdownItem`, `.menuItem`
- `LibraryView.module.css` `.youtubeSubmit`, `.secondaryButton`, `.primaryButton`, `.card`
- `NotationModal.module.css` `.primaryButton`, `.secondaryButton`, `.quoteRemove`

### Lightweight ripple substitute (P1)

Because a true Material ripple needs click coordinates, ship a **CSS-only press ripple** that radiates from center. Buttons that should ripple get `composes: ripple` (or add `className={styles.ripple}` in JSX).

```css
/* interactions.module.css */
.ripple {
  position: relative;
  overflow: hidden;
}

.ripple::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at var(--ripple-x, 50%) var(--ripple-y, 50%),
    rgba(255, 255, 255, 0.18) 10%,
    transparent 10%
  );
  background-repeat: no-repeat;
  background-size: 0% 0%;
  opacity: 0;
  transition: background-size 0.6s ease-out, opacity 0.6s ease-out;
  pointer-events: none;
}

.ripple:active::after {
  background-size: 350% 350%;
  opacity: 1;
  transition-duration: 0s;
}
```

For pointer-origin ripple, add a tiny helper (pseudo-code):

```js
function setRippleOrigin(el, e) {
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--ripple-x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
  el.style.setProperty('--ripple-y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
}
```

---

## 4. Typography scale

**Priority: P1** — the current type works but lacks hierarchy tokens.

Add these variables to `index.css`:

```css
:root {
  --font-sans: "Roboto", "Arial", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;

  /* Type scale */
  --text-display: 700 1.5rem/1.2 var(--font-sans);      /* 24px, hero empty states */
  --text-headline: 600 1.25rem/1.3 var(--font-sans);     /* 20px */
  --text-title: 600 1.125rem/1.4 var(--font-sans);       /* 18px — watch title */
  --text-body: 400 0.875rem/1.25 var(--font-sans);      /* 14px */
  --text-body-strong: 500 0.875rem/1.25 var(--font-sans);
  --text-meta: 400 0.75rem/1.125 var(--font-sans);       /* 12px */
  --text-label: 600 0.6875rem/1 var(--font-sans);       /* 11px uppercase labels */
  --text-caption: 
