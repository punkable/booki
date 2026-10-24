/* Settings building blocks, macOS System Settings style.
 *
 * A page is a title over grouped inset lists; each group is a rounded panel
 * of rows; each row is a label (and optional hint) on the left and one
 * control on the right, all on one alignment. Controls are native elements
 * styled in src/styles/settings.css — no component library.
 *
 * Button keeps the small Fluent-style API (appearance, size, icon) that the
 * profile and update panels were written against.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { icon } from "../icons.js";

/** Inline line icon from src/icons.js. */
export function Icon({ name, className = "" }) {
  return <span className={"ui-icon " + className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(name) }} />;
}

// ── Page structure ─────────────────────────────────────────────────────────

/** Page title, optional one-line description and a right-side slot. */
export function PageHeader({ title, children, meta }) {
  return (
    <header data-setting-label={typeof title === "string" ? title : undefined} className="ui-page-head">
      <div>
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
      </div>
      {meta ? <div className="ui-page-meta">{meta}</div> : null}
    </header>
  );
}

/** A titled group of rows. `icon` draws the page-coloured section glyph,
 *  `desc` a line under the title, `hint` a footer under the group. */
export function SettingsSection({ title, icon: glyph, desc, hint, children, className = "" }) {
  return (
    <section data-setting-label={typeof title === "string" ? title : undefined} className={"ui-group-wrap " + className}>
      {title ? <h2 className="ui-group-title">{glyph ? <Icon name={glyph} className="section-icon" /> : null}{title}</h2> : null}
      {desc ? <p className="ui-group-desc">{desc}</p> : null}
      <div className="ui-group">{children}</div>
      {hint ? <p className="ui-group-foot">{hint}</p> : null}
    </section>
  );
}

/** A group whose rows fold away behind a disclosure row. */
export function CollapsibleSection({ title, hint, count, defaultOpen = false, children, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section data-setting-label={typeof title === "string" ? title : undefined} className={"ui-group-wrap ui-collapsible " + (open ? "open " : "") + className}>
      <div className="ui-group">
        <button type="button" className="ui-row ui-disclosure" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="ui-row-text">
            <span className="ui-row-label">{title}</span>
            {hint ? <span className="ui-row-hint">{hint}</span> : null}
          </span>
          {count != null ? <span className="ui-count">{count}</span> : null}
          <Icon name="chevron-right" className="ui-chev" />
        </button>
        <div className="ui-disclosed" hidden={!open}>{children}</div>
      </div>
    </section>
  );
}

/** Label (+ hint) on the left, one control on the right. */
const RowLabel = createContext(undefined);
export function Row({ label, hint, children, stack = false }) {
  return (
    <div data-setting-label={typeof label === "string" ? label : undefined} className={"ui-row" + (stack ? " ui-row-stack" : "")}>
      <div className="ui-row-text">
        <span className="ui-row-label">{label}</span>
        {hint ? <span className="ui-row-hint">{hint}</span> : null}
      </div>
      <div className="ui-row-control"><RowLabel.Provider value={typeof label === 'string' ? label : undefined}>{children}</RowLabel.Provider></div>
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

/** The on/off switch itself. Like WinUI's ToggleSwitch, the knob stretches
 *  while pressed and can be dragged to the other side. */
function Switch({ checked, onChange, label }) {
  const drag = useRef(null);
  const [offset, setOffset] = useState(null);
  const TRAVEL = 15; // px a stretched (17 px) knob can travel inside the track
  const down = (event) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (d.moved) setOffset(Math.max(0, Math.min(TRAVEL, (checked ? TRAVEL : 0) + dx)));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      const on = (offset ?? 0) > TRAVEL / 2;
      // The click that follows a drag must not toggle it a second time.
      drag.current = { swallow: true };
      if (on !== !!checked) onChange(on);
    }
    setOffset(null);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      className={"ui-switch" + (checked ? " on" : "") + (offset != null ? " dragging" : "")}
      style={offset != null ? { "--knob-x": `${offset}px` } : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => { drag.current = null; setOffset(null); }}
      onClick={(event) => {
        if (drag.current?.swallow) { drag.current = null; event.stopPropagation(); return; }
        onChange(!checked);
      }}
    >
      <span className="ui-switch-knob" />
    </button>
  );
}

/** A row whose control is a switch; the whole row toggles it. */
export function Toggle({ checked, onChange, label, hint }) {
  return (
    <div data-setting-label={typeof label === "string" ? label : undefined} className="ui-row ui-toggle-row" onClick={(e) => { if (!e.target.closest(".ui-switch")) onChange(!checked); }}>
      <div className="ui-row-text">
        <span className="ui-row-label">{label}</span>
        {hint ? <span className="ui-row-hint">{hint}</span> : null}
      </div>
      <div className="ui-row-control">
        <Switch checked={!!checked} onChange={onChange} label={typeof label === "string" ? label : undefined} />
      </div>
    </div>
  );
}

/** Range slider with its value shown beside it. */
export function Slider({ value, min, max, step, onChange, fmt }) {
  const label = useContext(RowLabel);
  const v = Number(value ?? min);
  const pct = ((v - min) / Math.max(1e-9, max - min)) * 100;
  const [active, setActive] = useState(false);
  // WinUI shows the value above the thumb while it is being dragged.
  useEffect(() => {
    if (!active) return;
    const end = () => setActive(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, [active]);
  return (
    <div className={"ui-slider" + (active ? " active" : "")} style={{ "--p": pct / 100 }} onPointerDown={() => setActive(true)}>
      <span className="ui-slider-track">
      <span className="ui-slider-tip" aria-hidden="true">{fmt ? fmt(v) : v}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={v}
        style={{ "--pct": `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      </span>
      <span className="ui-slider-value">{fmt ? fmt(v) : v}</span>
    </div>
  );
}

/** Segmented control. options: [{ value, label, icon? }] */
export function SegmentedControl({ value, options, onChange, label: ownLabel }) {
  const rowLabel = useContext(RowLabel);
  const label = ownLabel || rowLabel;
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const navigate = (event) => {
    if (!options.length) return;
    const index = options.findIndex(option => option.value === value);
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (['ArrowRight','ArrowDown'].includes(event.key)) next = (Math.max(0,index) + 1) % options.length;
    else if (['ArrowLeft','ArrowUp'].includes(event.key)) next = (Math.max(0,index) + options.length - 1) % options.length;
    else return;
    event.preventDefault(); event.stopPropagation(); onChange(options[next].value);
    event.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus();
  };
  return (
    <div className="ui-seg" role="radiogroup" aria-label={label} onKeyDown={navigate} style={{ "--n": options.length, "--i": idx }}>
      <span className="ui-seg-thumb" aria-hidden="true" />
      {options.map((o,index) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={index === idx ? 0 : -1}
          className={"ui-seg-item" + (o.value === value ? " on" : "")}
          onClick={() => onChange(o.value)}
          title={o.label}
        >
          {o.icon ? (
            typeof o.icon === "string" && o.icon.includes("<svg")
              ? <span className="ui-seg-ico" dangerouslySetInnerHTML={{ __html: o.icon }} />
              : <span className="ui-seg-ico">{o.icon}</span>
          ) : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Native select, styled. options: [{ value, label }] */
export function Select({ value, options, onChange, label }) {
  return (
    <span className="ui-select">
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Icon name="chevron-down" />
    </span>
  );
}

/**
 * Dialog behaviour: lock page scroll, Escape closes, focus moves in, Tab
 * cycles inside, focus returns on close.
 */
export function useModalControls(onClose) {
  useEffect(() => {
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  useEffect(() => {
    const prevFocus = document.activeElement;
    const modals = document.querySelectorAll(".modal");
    const modal = modals[modals.length - 1]; // this hook's dialog is the topmost
    if (!modal) return;
    modal.tabIndex = -1;
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(modal.querySelectorAll(sel)).filter((el) => !el.disabled && el.offsetParent !== null);
    (focusables()[0] || modal).focus();
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const all = document.querySelectorAll(".modal");
      if (all[all.length - 1] !== modal) return; // a newer dialog is on top
      const list = focusables();
      if (!list.length) { e.preventDefault(); modal.focus(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
    };
  }, []);
}

// ── Fluent-compatible subset, implemented natively ─────────────────────────

/** appearance: "primary" | "subtle" | undefined; size: "small" | undefined. */
export function Button({ appearance, size, icon: glyph, children, className = "", ...rest }) {
  const cls = [!children ? "icon-button" : "button", appearance === "primary" ? "button-accent" : appearance === "subtle" ? "button-subtle" : "", size === "small" ? "button-small" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {glyph ? <span className="ui-btn-glyph">{glyph}</span> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
