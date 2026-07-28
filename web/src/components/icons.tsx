// Local, offline-first inline-SVG icon layer (DESIGN.md adjudication: kimi's
// §2 hand-rolled path data, Material-style/Apache-2.0 heritage — see README
// attribution — as the starting set, wrapped in codex's `<Icon name size />`
// component API). No sprite, no icon font, no CDN/network request. Any name
// codex's table calls for that kimi's table lacks is hand-rolled in the same
// 24px-grid filled style below. Tree-shaken: this is a single module, but
// only the paths actually referenced end up read at runtime.
import type { CSSProperties } from "react";

export type IconName =
  | "play"
  | "pause"
  | "volumeHigh"
  | "volumeOff"
  | "search"
  | "settings"
  | "editNote"
  | "edit"
  | "camera"
  | "autoAwesome"
  | "closedCaption"
  | "fullscreen"
  | "fullscreenExit"
  | "close"
  | "bookmark"
  | "share"
  | "download"
  | "visibility"
  | "visibilityOff"
  | "notifications"
  | "notificationsOff"
  | "chevronUp"
  | "chevronDown"
  | "refresh"
  | "check"
  | "star"
  | "starOutline"
  | "delete"
  | "noteAdd"
  | "folderOpen"
  | "copy"
  | "arrowBack"
  | "arrowForward"
  | "home"
  | "video";

// Filled 24x24 paths, `fill="currentColor"`.
const FILLED_PATHS: Record<string, string> = {
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  volumeHigh:
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.49 4.49 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  volumeOff:
    "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A9.86 9.86 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z",
  search:
    "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z",
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.24 0 .45-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z",
  editNote:
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  edit:
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  camera:
    "M9.4 10.5A4.1 4.1 0 1 0 14.6 10.5L12 8 9.4 10.5zM7 6h3.17L12 4h4l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2zm5 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12z",
  autoAwesome: "M12 2l2.47 7.59L22 12l-7.53 2.41L12 22l-2.47-7.59L2 12l7.53-2.41L12 2z",
  closedCaption:
    "M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-7.5 5.5H10c-.28 0-.5.22-.5.5v4c0 .28.22.5.5.5h1.5v1.5H10a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1.5v1.5zm7 0H17c-.28 0-.5.22-.5.5v4c0 .28.22.5.5.5h1.5v1.5H17a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1.5v1.5z",
  fullscreen: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  fullscreenExit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  bookmark: "M5 3h14a2 2 0 0 1 2 2v16l-9-4-9 4V5a2 2 0 0 1 2-2z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  visibility:
    "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  visibilityOff:
    "M12 6.5c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16c.57-.23 1.18-.36 1.82-.36zM2.71 3.16 1.3 4.57l2.68 2.68C2.61 8.4 1.51 9.98.8 11.75 2.53 16.14 6.8 19.25 11.8 19.25c1.55 0 3.02-.3 4.36-.85l3.02 3.02 1.41-1.41L2.71 3.16zM7.53 8c-.02.16-.03.33-.03.5a4.5 4.5 0 0 0 4.5 4.5c.17 0 .34-.01.5-.03L7.53 8z",
  notifications:
    "M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  notificationsOff:
    "M20.71 20.29 3.71 3.29 2.29 4.71l3.02 3.02C5.12 8.68 5 9.82 5 11v5l-2 2v1h13.79l1.5 1.5 1.42-1.42zM12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zM18 16v-3.79l-6.79-6.79A1.5 1.5 0 0 1 13.5 4v.68C16.36 5.36 18 7.93 18 11v5l1.68 1.68-.68.68z",
  chevronUp: "M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z",
  chevronDown: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z",
  refresh:
    "M12 6V2L7 7l5 5V8c3.31 0 6 2.69 6 6a6 6 0 0 1-6 6 6 6 0 0 1-6-6H4a8 8 0 0 0 8 8 8 8 0 0 0 8-8c0-4.42-3.58-8-8-8z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  star: "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  starOutline:
    "M12 15.4 16.5 18l-1.2-5.15L19.4 9.24l-5.28-.45L12 4l-2.12 4.79-5.28.45 4.1 3.61L7.5 18 12 15.4zM12 2l3.09 6.99 7.61.66-5.75 5 1.71 7.44L12 18.27 5.34 22.09l1.71-7.44-5.75-5 7.61-.66z",
  delete:
    "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  noteAdd:
    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3v2z",
  folderOpen:
    "M20 6h-4.17l-1.41-1.41A2 2 0 0 0 13 4h-2a2 2 0 0 0-1.41.59L8.17 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 12H4V8h16v10z",
  copy:
    "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
  arrowBack: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  arrowForward: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  video:
    "M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z",
};

// Stroke-based icons (2px stroke, round caps/joins).
const STROKE_PATHS: Record<string, string> = {
  share: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4 0h6v6m0-12L10 14",
};

export function Icon({
  name,
  size = 24,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const strokePath = STROKE_PATHS[name];
  if (strokePath) {
    return (
      <svg
        className={className}
        style={style}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        aria-hidden="true"
      >
        <path d={strokePath} />
      </svg>
    );
  }
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
      aria-hidden="true"
    >
      <path d={FILLED_PATHS[name]} />
    </svg>
  );
}
