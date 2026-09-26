// Minimal stroke icon set (24px grid, currentColor).
import { html } from "./lib.js";

const PATHS = {
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z M9 12l2 2 4-4",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5 11a7 7 0 0 0 14 0 M12 18v3",
  send: "M4 12l16-8-6 16-2.5-6.5L4 12z",
  sun: "M12 4V2 M12 22v-2 M4.9 4.9 3.5 3.5 M20.5 20.5l-1.4-1.4 M4 12H2 M22 12h-2 M4.9 19.1l-1.4 1.4 M20.5 3.5l-1.4 1.4 M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  speaker: "M4 9v6h4l5 4V5L8 9H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11",
  stop: "M7 7h10v10H7z",
  doc: "M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6",
  scan: "M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M4 12h16",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12 M18 6L6 18",
  alert: "M12 4l9 16H3L12 4z M12 10v4 M12 17.5v.01",
  info: "M12 8v.01 M11 12h1v5h1 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  flip: "M4 12a8 8 0 0 1 14-5.3L20 9 M20 4v5h-5 M20 12a8 8 0 0 1-14 5.3L4 15 M4 20v-5h5",
  print: "M7 9V3h10v6 M7 17H4v-7h16v7h-3 M7 14h10v7H7z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  reset: "M4 4v6h6 M4.5 10A8 8 0 1 1 6 17",
  scale: "M12 3v18 M5 21h14 M6 7h12 M6 7l-3 7a3 3 0 0 0 6 0L6 7z M18 7l-3 7a3 3 0 0 0 6 0l-3-7z",
  pencil: "M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
};

export function Icon({ name, className = "w-5 h-5", strokeWidth = 2 }) {
  return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=${strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" className=${className} aria-hidden="true">
    <path d=${PATHS[name]} />
  </svg>`;
}
