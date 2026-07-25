/* Shared harness for the dock smoke tests.

   Booki's three windows are plain pages that talk to Rust over `window.__TAURI__`.
   Serving `dist/` and injecting a fake bridge therefore exercises the real
   rendering, layout and event wiring — which is where every bug this suite
   guards against actually lived (widget geometry, hide logic, null derefs).

   Run `npm run build` first; these tests read `dist/`. */
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DIST = join(HERE, "..", "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

export function assertBuilt() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error("dist/ is missing — run `npm run build` before `npm test`.");
  }
}

export async function serveDist() {
  const srv = http.createServer((req, res) => {
    const rel = req.url.split("?")[0];
    const p = join(DIST, rel === "/" ? "index.html" : rel);
    if (!existsSync(p) || !p.startsWith(DIST)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, port: srv.address().port };
}

/** Config the fake backend hands back. Always onboarded, so no coach overlay. */
export function makeConfig(overrides = {}) {
  return {
    onboarded: true,
    settingsIntroSeen: true,
    seenVersion: "99.0.0",
    edge: "bottom",
    monitor: -1,
    iconSize: 48,
    spacing: 10,
    zoom: 1.35,
    autoHideMode: "off",
    notchTrigger: "click",
    notchMode: "attached",
    notchPosition: "center",
    notchPeek: true,
    notchScale: 1,
    surfaceStyle: "acrylic",
    theme: "dark",
    accent: "#dfaa75",
    edgeGap: 48,
    materialStrength: 55,
    labels: true,
    showLabels: true,
    indicators: true,
    magnify: true,
    magnification: true,
    language: "en",
    hideInFullscreen: true,
    pinned: [],
    ...overrides,
  };
}

/** One tile of every kind, so a geometry regression anywhere shows up. */
export const ALL_WIDGETS = [
  "clock",
  "cpu",
  "ram",
  "disk",
  "net",
  "uptime",
  "battery",
  "notes",
  "media",
  "volume",
  "clipboard",
];

export function everyKindPinned() {
  return [
    { id: "app1", kind: "app", name: "One", path: "C:/one.exe" },
    { id: "app2", kind: "app", name: "Two", path: "C:/two.exe" },
    { id: "sep1", kind: "separator" },
    {
      id: "grp1",
      kind: "group",
      name: "Group",
      children: [{ id: "kid1", kind: "app", name: "Kid", path: "C:/kid.exe" }],
    },
    ...ALL_WIDGETS.map((w) => ({
      id: `w-${w}`,
      kind: "widget",
      widget: w,
      ...(w === "notes" ? { style: { note: "a note" } } : {}),
    })),
  ];
}

/* The fake bridge. `stats` lets a test drive edge cases — most importantly
   battery < 0, which is what a desktop PC reports and what used to throw. */
function bridgeSource(cfg, { stats = {} } = {}) {
  const sys = {
    cpu: 33,
    mem: 50,
    mem_used_mb: 4000,
    mem_total_mb: 16000,
    disk: 20,
    disk_used_gb: 50,
    disk_total_gb: 250,
    net_down_kbps: 5,
    net_up_kbps: 1,
    uptime_secs: 7200,
    battery: 62,
    charging: false,
    ...stats,
  };
  return `
    window.__bookiErrors = [];
    window.__TAURI__ = {
      core: {
        invoke: (cmd) => {
          switch (cmd) {
            case "get_config": return Promise.resolve(${JSON.stringify(cfg)});
            case "system_stats": return Promise.resolve(${JSON.stringify(sys)});
            case "volume_info": return Promise.resolve([40, false]);
            case "media_info": return Promise.resolve(null);
            case "clipboard_summary": return Promise.resolve({ count: 2, preview: "copied text" });
            case "clipboard_history": return Promise.resolve([]);
            case "list_windows": case "running_windows": return Promise.resolve([]);
            case "trash_count": return Promise.resolve(0);
            case "trash_is_empty": return Promise.resolve(true);
            case "app_icon": case "image_data_uri": case "file_thumbnail": return Promise.resolve("");
            case "list_monitors":
              return Promise.resolve([{ index: 0, name: "D1", x: 0, y: 0, w: 1920, h: 1080, primary: true }]);
            case "list_installed_apps": case "profile_list": case "recent_files": return Promise.resolve([]);
            case "recent_files_for": return Promise.resolve(null);
            case "get_autostart": return Promise.resolve(false);
            case "take_pending_tab": return Promise.resolve(null);
            case "take_pending_changelog": return Promise.resolve(false);
            case "check_update": return Promise.resolve(null);
            case "dock_cover_workarea":
              return Promise.resolve({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
            default: return Promise.resolve(null);
          }
        },
      },
      event: {
        listen: () => Promise.resolve(() => {}),
        emit: () => Promise.resolve(),
      },
      window: {
        getCurrentWindow: () => ({
          setSize: () => Promise.resolve(),
          setPosition: () => Promise.resolve(),
          innerSize: () => Promise.resolve({ width: window.innerWidth, height: window.innerHeight }),
        }),
      },
    };
  `;
}

/** Open a Booki page with the fake backend and collect any JS error. */
export async function openPage(browser, port, page_ = "index.html", { cfg, viewport, stats } = {}) {
  const page = await browser.newPage({
    viewport: viewport || { width: 1600, height: 400 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // A missing favicon is not a product defect and would drown the signal.
    if (text.includes("favicon") || text.includes("404")) return;
    errors.push(`console: ${text}`);
  });
  await page.addInitScript(bridgeSource(cfg || makeConfig(), { stats }));
  await page.goto(`http://127.0.0.1:${port}/${page_}`);
  await page.waitForTimeout(1200); // boot + first widget paint
  return { page, errors };
}

/* Prefer a browser the environment already provides (BOOKI_CHROMIUM, or the
   preinstalled one in this dev container) and otherwise let Playwright resolve
   the copy it downloaded, so the same suite runs locally and in CI. */
export async function launchBrowser() {
  const candidates = [process.env.BOOKI_CHROMIUM, "/opt/pw-browsers/chromium"].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  return chromium.launch(executablePath ? { executablePath } : {});
}

/** Geometry of every tile on the bar, plus the bar's own box. */
export async function measureTiles(page) {
  return page.evaluate(() => {
    const dock = document.getElementById("dock");
    const d = dock.getBoundingClientRect();
    const tiles = [...dock.querySelectorAll(".tile")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.id || null,
        widget: el.dataset.widget || null,
        kind: el.classList.contains("widget") ? "widget" : "tile",
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
        top: Math.round(r.top * 100) / 100,
        left: Math.round(r.left * 100) / 100,
      };
    });
    return {
      dock: {
        w: Math.round(d.width * 100) / 100,
        h: Math.round(d.height * 100) / 100,
      },
      tiles,
    };
  });
}

/* Does any widget's inner art (ring gauge / preview icon square) stick out of
   the card that clips it? `.w-card` has overflow:hidden, so overflow here means
   silently sliced artwork on screen. */
export async function measureArtOverflow(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".tile.widget")]
      .map((tile) => {
        const card = tile.querySelector(".w-card");
        const art = tile.querySelector(".w-ring, .w-pv-ico");
        if (!card || !art) return null;
        const cs = getComputedStyle(card);
        const inner =
          card.getBoundingClientRect().height -
          parseFloat(cs.paddingTop) -
          parseFloat(cs.paddingBottom) -
          parseFloat(cs.borderTopWidth) -
          parseFloat(cs.borderBottomWidth);
        const artH = art.getBoundingClientRect().height;
        return {
          widget: tile.dataset.widget,
          art: Math.round(artH * 100) / 100,
          box: Math.round(inner * 100) / 100,
          overflow: Math.round((artH - inner) * 100) / 100,
        };
      })
      .filter(Boolean)
  );
}
