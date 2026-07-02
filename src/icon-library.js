/* Built-in icon library for pinned items. Lucide-style line glyphs (24×24,
   currentColor). A pin can store a token "lib:<name>:<style>" instead of a real
   icon; the dock and settings render it to an SVG data URI with the live accent,
   so the chosen icon follows the theme.

   Styles: "badge" (white glyph on an accent rounded square — app-icon look),
   "glyph" (accent line glyph, transparent), "tint" (accent glyph on a soft
   accent square). */

export const ICON_STYLES = ["badge", "glyph", "tint"];

// name → inner SVG paths (24×24 viewBox, stroke=currentColor).
const P = {
  app: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4M2 8h20"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>`,
  mail: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>`,
  music: `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`,
  image: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>`,
  terminal: `<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>`,
  code: `<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>`,
  gamepad: `<path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="6"/>`,
  folder: `<path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/>`,
  chat: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  camera: `<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>`,
  video: `<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4Z"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>`,
  doc: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>`,
  download: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>`,
  store: `<path d="M3 9 4 4h16l1 5M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M4 9h16"/>`,
  map: `<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14"/>`,
  headphones: `<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="5" height="7" rx="1.5"/><rect x="17" y="14" width="5" height="7" rx="1.5"/>`,
  book: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/>`,
  star: `<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9Z"/>`,
  cloud: `<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6 19Z"/>`,
  lock: `<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`,
  calculator: `<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h4"/>`,
  palette: `<circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/><path d="M12 22a10 10 0 1 1 10-10c0 2-2 3-4 3h-1a2 2 0 0 0-1 3.7A2 2 0 0 1 12 22Z"/>`,
  monitor: `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>`,
  phone: `<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>`,
  wifi: `<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>`,
  bell: `<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  home: `<path d="m3 10 9-7 9 7M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  zap: `<path d="M13 2 4 14h7l-2 8 9-12h-7Z"/>`,
  coffee: `<path d="M4 8h14v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM18 8h2a2 2 0 0 1 0 6h-2M6 2v2M10 2v2M14 2v2"/>`,
  heart: `<path d="M19 14c1.5-1.5 3-3.6 3-5.5A4.5 4.5 0 0 0 12 6 4.5 4.5 0 0 0 2 8.5c0 1.9 1.5 4 3 5.5l7 7Z"/>`,
};

export const ICON_LIBRARY = Object.keys(P);

export function isLibIcon(value) {
  return typeof value === "string" && value.startsWith("lib:");
}

export function parseLibIcon(value) {
  const parts = String(value).split(":");
  return { name: parts[1] || "app", style: parts[2] || "badge" };
}

export function libToken(name, style) {
  return `lib:${name}:${style}`;
}

/** Render a library icon to an SVG data URI using the given colors. */
export function libIconDataUri(name, style, { accent, accentDeep, contrast }) {
  const paths = P[name] || P.app;
  const a = accent || "#dfaa75";
  const a2 = accentDeep || a;
  const ink = contrast || "#ffffff";
  const glyph = (color) =>
    `<g transform="translate(8 8) scale(1.66)" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
  let body;
  if (style === "glyph") {
    body = glyph(a);
  } else if (style === "tint") {
    body =
      `<rect x="2" y="2" width="60" height="60" rx="15" fill="${a}" fill-opacity="0.18"/>` +
      glyph(a);
  } else {
    // badge: accent gradient square + white glyph (app-icon look)
    body =
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${a2}"/></linearGradient></defs>` +
      `<rect x="2" y="2" width="60" height="60" rx="15" fill="url(#g)"/>` +
      glyph(ink);
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${body}</svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

/** Read the live accent colors from CSS custom properties. */
export function currentAccentColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    accent: s.getPropertyValue("--accent").trim() || "#dfaa75",
    accentDeep: s.getPropertyValue("--accent-deep").trim() || "#b9875f",
    contrast: s.getPropertyValue("--accent-contrast").trim() || "#ffffff",
  };
}

/** Resolve any pin icon value to something an <img> can render (or null). */
export function resolveLibIcon(value) {
  if (!isLibIcon(value)) return value || null;
  const { name, style } = parseLibIcon(value);
  return libIconDataUri(name, style, currentAccentColors());
}
