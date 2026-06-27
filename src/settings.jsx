/* Booki Dock — Settings (React). Modern sidebar + tabbed panels.
   Shares the config bridge in api.js; changes apply to the dock live. */

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  config as configApi,
  dock as dockApi,
  pickAppFile,
  pickFolder,
  emitConfigChanged,
  closeSelf,
  logMessage,
} from "./api.js";
import { applyTheme } from "./theme.js";

window.addEventListener("error", (e) => logMessage("error", `settings: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `settings: unhandled ${e.reason}`)
);

const uid = () => Math.random().toString(36).slice(2, 9);

const ACCENTS = [
  ["Tan (Booki)", "#dfaa75"],
  ["Ámbar", "#ffbe0b"],
  ["Naranja", "#fb5607"],
  ["Rosa", "#ff006e"],
  ["Violeta", "#8338ec"],
  ["Azul", "#3a86ff"],
  ["Verde", "#2ecc71"],
];

const TABS = [
  ["appearance", "Apariencia", "palette"],
  ["behavior", "Comportamiento", "settings"],
  ["apps", "Apps ancladas", "grid"],
  ["shortcuts", "Atajos", "app"],
  ["about", "Acerca de", "heart"],
];

// ── Reusable controls ──

function Row({ label, children, hint }) {
  return (
    <div className="r-row">
      <div className="r-label">
        {label}
        {hint && <span className="r-hint">{hint}</span>}
      </div>
      <div className="r-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="r-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="r-switch" />
    </label>
  );
}

function Slider({ value, min, max, step, onChange, fmt }) {
  return (
    <div className="r-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="r-val">{fmt ? fmt(value) : value}</span>
    </div>
  );
}

function PinThumb({ item }) {
  const [src, setSrc] = useState(item.icon || null);
  useEffect(() => {
    let alive = true;
    if (!item.icon && item.path) {
      dockApi.appIcon(item.path).then((u) => alive && setSrc(u));
    }
    return () => {
      alive = false;
    };
  }, [item.path, item.icon]);
  return (
    <span className="pin-thumb">
      {src ? <img src={src} alt="" /> : (item.name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function HotkeyInput({ value, onChange }) {
  const capture = (e) => {
    e.preventDefault();
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Super");
    const k = e.key;
    if (["Control", "Alt", "Shift", "Meta"].includes(k)) return;
    const key = k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k;
    if (mods.length === 0) return; // require a modifier
    onChange([...mods, key].join("+"));
  };
  return (
    <div className="r-hotkey">
      <input
        readOnly
        value={value || ""}
        placeholder="Pulsa una combinación…"
        onKeyDown={capture}
      />
      {value && (
        <button className="s-btn s-btn-soft" onClick={() => onChange("")}>
          Borrar
        </button>
      )}
    </div>
  );
}

// ── Panels ──

function Appearance({ cfg, set }) {
  return (
    <>
      <h1>Apariencia</h1>
      <Row label="Tema">
        <select value={cfg.theme} onChange={(e) => set({ theme: e.target.value })}>
          <option value="system">Sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </Row>
      <Row label="Color de acento">
        <div className="swatches">
          {ACCENTS.map(([name, val]) => (
            <button
              key={val}
              className={"swatch" + (cfg.accent === val ? " active" : "")}
              style={{ background: val }}
              title={name}
              onClick={() => set({ accent: val })}
            />
          ))}
          <input
            type="color"
            className="swatch-custom"
            value={cfg.accent}
            title="Color personalizado"
            onChange={(e) => set({ accent: e.target.value })}
          />
        </div>
      </Row>
      <Row label="Tamaño de iconos">
        <Slider value={cfg.iconSize} min={32} max={80} step={4} fmt={(v) => `${v}px`}
          onChange={(v) => set({ iconSize: v })} />
      </Row>
      <Row label="Espaciado">
        <Slider value={cfg.spacing} min={0} max={20} step={1} fmt={(v) => `${v}px`}
          onChange={(v) => set({ spacing: v })} />
      </Row>
      <Row label="Translucidez">
        <Slider value={Math.round(cfg.opacity * 100)} min={20} max={100} step={5}
          fmt={(v) => `${v}%`} onChange={(v) => set({ opacity: v / 100 })} />
      </Row>
    </>
  );
}

function Behavior({ cfg, set }) {
  const [monitors, setMonitors] = useState([]);
  const [autostart, setAutostart] = useState(!!cfg.autostart);
  useEffect(() => {
    dockApi.listMonitors().then((m) => setMonitors(m || []));
    dockApi.getAutostart().then((v) => setAutostart(!!v));
  }, []);
  return (
    <>
      <h1>Comportamiento</h1>
      <Row label="Borde de anclaje">
        <select value={cfg.edge} onChange={(e) => set({ edge: e.target.value })}>
          <option value="bottom">Abajo</option>
          <option value="top">Arriba</option>
          <option value="left">Izquierda</option>
          <option value="right">Derecha</option>
        </select>
      </Row>
      <Row label="Animación al ampliar">
        <select value={cfg.magnifyStyle} onChange={(e) => set({ magnifyStyle: e.target.value })}>
          <option value="spring">Resorte (pop + elevación)</option>
          <option value="smooth">Suave</option>
          <option value="off">Sin animación</option>
        </select>
      </Row>
      <Toggle label="Magnificar iconos al pasar el cursor" checked={cfg.magnification}
        onChange={(v) => set({ magnification: v })} />
      {cfg.magnification && (
        <Row label="Intensidad del zoom" hint="Cuánto se agrandan los iconos">
          <Slider value={Math.round(cfg.zoom * 100)} min={110} max={180} step={5}
            fmt={(v) => `${v}%`} onChange={(v) => set({ zoom: v / 100 })} />
        </Row>
      )}
      <Row label="Pantalla (monitor)">
        <select value={cfg.monitor} onChange={(e) => set({ monitor: Number(e.target.value) })}>
          <option value={-1}>Automática</option>
          {monitors.map((m) => (
            <option key={m.index} value={m.index}>
              {m.name}{m.primary ? " (principal)" : ""}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Intensidad del material" hint="Acrylic / Mica">
        <Slider value={cfg.materialStrength} min={0} max={100} step={5} fmt={(v) => `${v}%`}
          onChange={(v) => { set({ materialStrength: v }); dockApi.setMaterial(v); }} />
      </Row>
      <Toggle label="Mostrar nombres al pasar el cursor" checked={cfg.showLabels}
        onChange={(v) => set({ showLabels: v })} />
      <Toggle label="Indicar apps en ejecución" checked={cfg.showIndicators}
        onChange={(v) => set({ showIndicators: v })} />
      <Toggle label="Mantener siempre visible" checked={cfg.alwaysOnTop}
        onChange={(v) => { set({ alwaysOnTop: v }); dockApi.setAlwaysOnTop(v); }} />
      <Toggle label="Iniciar con Windows" checked={autostart}
        onChange={(v) => { setAutostart(v); set({ autostart: v }); dockApi.setAutostart(v); }} />
      <Row label="Ocultar automáticamente">
        <select value={cfg.autoHideMode} onChange={(e) => set({ autoHideMode: e.target.value })}>
          <option value="off">Nunca</option>
          <option value="smart">Inteligente (cuando una ventana lo tapa)</option>
          <option value="edge">Siempre (revelar en el borde)</option>
        </select>
      </Row>
      {cfg.autoHideMode === "edge" && (
        <Row label="Retraso para ocultar">
          <Slider value={cfg.autoHideDelay} min={0} max={2000} step={50}
            fmt={(v) => `${v}ms`} onChange={(v) => set({ autoHideDelay: v })} />
        </Row>
      )}
    </>
  );
}

function Apps({ cfg, set }) {
  const listRef = useRef(null);
  const pinnedRef = useRef(cfg.pinned);
  pinnedRef.current = cfg.pinned;
  const drag = useRef(null);

  const startDrag = (i) => (e) => {
    e.preventDefault();
    drag.current = { from: i };
    const onMove = (ev) => {
      const lis = [...listRef.current.querySelectorAll(".pin-item")];
      let to = lis.findIndex((li) => {
        const r = li.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (to === -1) to = pinnedRef.current.length - 1;
      const from = drag.current.from;
      if (to >= 0 && to !== from) {
        const p = [...pinnedRef.current];
        const [m] = p.splice(from, 1);
        p.splice(to, 0, m);
        drag.current.from = to;
        set({ pinned: p });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };
  const remove = (i) => set({ pinned: cfg.pinned.filter((_, k) => k !== i) });
  const addApp = async () => {
    const path = await pickAppFile();
    if (path) set({ pinned: [...cfg.pinned, mkApp(path)] });
  };
  const addFolder = async () => {
    const path = await pickFolder();
    if (path) set({ pinned: [...cfg.pinned, mkApp(path)] });
  };
  const addSep = () =>
    set({ pinned: [...cfg.pinned, { id: uid(), name: "", path: "", args: [], kind: "separator" }] });

  return (
    <>
      <h1>Apps ancladas</h1>
      <p className="muted">Arrastra programas o carpetas desde el escritorio al dock, o añádelos aquí.</p>
      <ul className="pin-list" ref={listRef}>
        {cfg.pinned.length === 0 && <li className="pin-empty">Aún no hay nada anclado.</li>}
        {cfg.pinned.map((item, i) => (
          <li key={item.id} className={"pin-item" + (item.kind === "separator" ? " sep" : "")}>
            <span className="pin-left">
              <button className="pin-handle" title="Arrastrar para reordenar"
                onPointerDown={startDrag(i)}>⠿</button>
              {item.kind !== "separator" && <PinThumb item={item} />}
              <span className="pin-name" title={item.path}>
                {item.kind === "separator" ? "— separador —" : item.name}
              </span>
            </span>
            <span className="pin-actions">
              {item.kind !== "separator" && (
                <button className="pin-btn" title="Abrir ubicación"
                  onClick={() => dockApi.openLocation(item.path)}>↗</button>
              )}
              <button className="pin-btn del" title="Quitar" onClick={() => remove(i)}>✕</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="s-actions">
        <button className="s-btn" onClick={addApp}>+ Añadir app…</button>
        <button className="s-btn s-btn-soft" onClick={addFolder}>+ Carpeta…</button>
        <button className="s-btn s-btn-soft" onClick={addSep}>+ Separador</button>
      </div>
    </>
  );
}

function mkApp(path) {
  const file = String(path).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "App";
  return { id: uid(), name: file.replace(/\.(exe|lnk|bat|cmd)$/i, ""), path, args: [], kind: "app" };
}

function Shortcuts({ cfg, set }) {
  return (
    <>
      <h1>Atajos</h1>
      <Row label="Mostrar / ocultar dock" hint="Atajo global del sistema">
        <HotkeyInput
          value={cfg.hotkey}
          onChange={(v) => {
            set({ hotkey: v });
            dockApi.setHotkey(v);
          }}
        />
      </Row>
      <div className="s-card-inner">
        <h3>Otras formas de controlar Booki</h3>
        <ul className="muted-list">
          <li>Clic izquierdo en el icono de la bandeja: mostrar / ocultar el dock.</li>
          <li>Doble clic en la bandeja: abrir Ajustes.</li>
          <li>Clic derecho en el dock: añadir app o carpeta, ajustes.</li>
          <li>Arrastrar del escritorio al dock: anclar.</li>
        </ul>
      </div>
    </>
  );
}

function About({ version }) {
  return (
    <>
      <h1>Acerca de</h1>
      <div className="s-about">
        <img className="s-about-logo" src="/brand/svg/isotype.svg" alt="Booki" />
        <div>
          <strong>Booki Dock</strong> <span className="s-ver">v{version}</span>
          <p className="muted" style={{ marginTop: 4 }}>
            Un dock alegre y ligero para Windows.
          </p>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        Hecho con Tauri + Rust · MIT.
      </p>
    </>
  );
}

// ── App shell ──

function App() {
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("appearance");
  const [version, setVersion] = useState("0.1.0");
  const saveTimer = useRef(null);

  useEffect(() => {
    configApi.get().then((c) => {
      setCfg(c);
      applyTheme(c);
    });
    dockApi.appVersion().then(setVersion);
  }, []);

  const set = (patch) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      applyTheme(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await configApi.save(next);
        await emitConfigChanged();
      }, 120);
      return next;
    });
  };

  const reset = async () => {
    const fresh = await configApi.reset();
    if (fresh) {
      setCfg(fresh);
      applyTheme(fresh);
      await emitConfigChanged();
    }
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeSelf();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!cfg) return <div className="loading">Cargando…</div>;

  return (
    <div className="s-shell">
      <aside className="s-sidebar">
        <div className="s-brand">
          <img src="/brand/svg/isotype.svg" alt="" />
          <span>Booki</span>
        </div>
        <nav>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={"s-navitem" + (tab === id ? " active" : "")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="s-sidebar-foot">
          <button className="s-btn s-btn-soft" onClick={reset}>Restablecer</button>
          <button className="s-btn s-btn-ghost" onClick={() => dockApi.quit()}>Salir</button>
        </div>
      </aside>
      <main className="s-content">
        {tab === "appearance" && <Appearance cfg={cfg} set={set} />}
        {tab === "behavior" && <Behavior cfg={cfg} set={set} />}
        {tab === "apps" && <Apps cfg={cfg} set={set} />}
        {tab === "shortcuts" && <Shortcuts cfg={cfg} set={set} />}
        {tab === "about" && <About version={version} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
