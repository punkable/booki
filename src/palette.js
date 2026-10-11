/* Booki's suggested colours: Pantone Colors of the Year that sit well next
   to Booki's warm, capybara-brown look, led by Booki's own tan. The hex
   values are close sRGB matches for the screen, not print references.
   They come first wherever a colour is picked, so a choice always looks at
   home; any other colour stays one click away. */
export const ACCENT_PALETTE = [
  { id: "booki", name: "Booki", hex: "#dfaa75" },
  { id: "mocha-mousse", name: "Mocha Mousse", code: "17-1230", year: 2025, hex: "#a47864" },
  { id: "peach-fuzz", name: "Peach Fuzz", code: "13-1023", year: 2024, hex: "#ffbe98" },
  { id: "living-coral", name: "Living Coral", code: "16-1546", year: 2019, hex: "#ff6f61" },
  { id: "tangerine-tango", name: "Tangerine Tango", code: "17-1463", year: 2012, hex: "#dd4124" },
  { id: "viva-magenta", name: "Viva Magenta", code: "18-1750", year: 2023, hex: "#bb2649" },
  { id: "radiant-orchid", name: "Radiant Orchid", code: "18-3224", year: 2014, hex: "#b163a3" },
  { id: "very-peri", name: "Very Peri", code: "17-3938", year: 2022, hex: "#6667ab" },
  { id: "classic-blue", name: "Classic Blue", code: "19-4052", year: 2020, hex: "#0f4c81" },
  { id: "emerald", name: "Emerald", code: "17-5641", year: 2013, hex: "#009473" },
  { id: "greenery", name: "Greenery", code: "15-0343", year: 2017, hex: "#88b04b" },
  { id: "illuminating", name: "Illuminating", code: "13-0647", year: 2021, hex: "#f5df4d" },
];

/** The palette entry for a colour, or null for a custom one. */
export function paletteEntry(hex) {
  const value = String(hex || "").toLowerCase();
  return ACCENT_PALETTE.find((entry) => entry.hex === value) || null;
}
