/* Build a Fluent UI v9 theme from Booki's dynamic accent + light/dark mode.
   Keeps Fluent's neutral palettes so components look native, but remaps the
   brand color to Booki's accent so the UI feels coherent. */

import { webLightTheme, webDarkTheme } from "@fluentui/react-components";

function resolveThemeMode(theme) {
  if (theme === "auto") {
    const h = new Date().getHours();
    return h >= 7 && h < 19 ? "light" : "dark";
  }
  if (theme === "dark" || theme === "light") return theme;
  // "system" or anything else → match OS/media query if possible.
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

function shade(hex, t) {
  // t < 0 darkens, t > 0 lightens (in sRGB, good enough for accents).
  const c = hexToRgb(hex);
  const target = t < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  return toHex(mix(c, target, Math.abs(t)));
}

export function buildFluentTheme(accent, theme) {
  const mode = resolveThemeMode(theme);
  const base = mode === "dark" ? { ...webDarkTheme } : { ...webLightTheme };
  const a = accent || "#dfaa75";
  const deep = shade(a, -0.22);
  const soft = shade(a, mode === "dark" ? 0.28 : 0.72);
  const hover = shade(a, mode === "dark" ? 0.08 : -0.08);
  const pressed = shade(a, mode === "dark" ? -0.14 : -0.18);

  return {
    ...base,
    colorBrandForeground1: a,
    colorBrandForeground2: deep,
    colorBrandBackground: a,
    colorBrandBackgroundHover: hover,
    colorBrandBackgroundPressed: pressed,
    colorBrandBackgroundSelected: a,
    colorBrandStroke1: a,
    colorBrandStroke2: soft,
    colorCompoundBrandForeground1: a,
    colorCompoundBrandForeground1Hover: hover,
    colorCompoundBrandForeground1Pressed: pressed,
    colorCompoundBrandBackground: a,
    colorCompoundBrandBackgroundHover: hover,
    colorCompoundBrandBackgroundPressed: pressed,
    colorBrandBackground2: soft,
    colorBrandForegroundInverted: mode === "dark" ? "#000000" : "#ffffff",
    colorBrandBackgroundInverted: mode === "dark" ? "#ffffff" : "#000000",
  };
}
