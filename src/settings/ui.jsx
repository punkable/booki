/* Settings building blocks, macOS System Settings style.
 *
 * A page is a title over grouped inset lists; each group is a rounded panel
 * of rows; each row is a label (and optional hint) on the left and one
 * control on the right, all on one alignment. Controls are native elements
 * styled in src/styles/settings.css — no component library.
 *
 * The second half keeps the small subset of the Fluent UI API the Apps editor
 * was written against (Button, Menu, Dropdown…), implemented natively, so the
 * dependency could be dropped without rewriting that editor's logic.
 */
import React, { cloneElement, createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { icon } from "../icons.js";

/** Inline line icon from src/icons.js. */
export function Icon({ name, className = "" }) {
  return <span className={"ui-icon " + className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(name) }} />;
}

// ── Page structure ─────────────────────────────────────────────────────────

/** Page title, optional one-line description and a right-side slot. */
export function PageHeader({ title, children, meta }) {
  return (
    <header className="ui-page-head">
      <div>
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
      </div>
      {meta ? <div className="ui-page-meta">{meta}</div> : null}
    </header>
  );
}

/** A titled inset group of rows. `hint` sits under the group as its footer. */
export function SettingsSection({ title, hint, children, className = "" }) {
  return (
    <section className={"ui-group-wrap " + className}>
      {title ? <h2 className="ui-group-title">{title}</h2> : null}
      <div className="ui-group">{children}</div>
      {hint ? <p className="ui-group-foot">{hint}</p> : null}
    </section>
  );
}

/** A group whose rows fold away behind a disclosure row. */
export function CollapsibleSection({ title, hint, count, defaultOpen = false, children, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={"ui-group-wrap ui-collapsible " + (open ? "open " : "") + className}>
      <div className="ui-group">
        <button type="button" className="ui-row ui-disclosure" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="ui-row-text">
            <span className="ui-row-label">{title}</span>
            {hint ? <span className="ui-row-hint">{hint}</span> : null}
          </span>
          {count != null ? <span className="ui-count">{count}</span> : null}
          <Icon name="chevron-right" className="ui-chev" />
        </button>
        {open ? <div className="ui-disclosed">{children}</div> : null}
      </div>
    </section>
  );
}

/** Label (+ hint) on the left, one control on the right. */
export function Row({ label, hint, children, stack = false }) {
  return (
    <div className={"ui-row" + (stack ? " ui-row-stack" : "")}>
      <div className="ui-row-text">
        <span className="ui-row-label">{label}</span>
        {hint ? <span className="ui-row-hint">{hint}</span> : null}
      </div>
      <div className="ui-row-control">{children}</div>
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

/** The on/off switch itself. */
export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      className={"ui-switch" + (checked ? " on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-knob" />
    </button>
  );
}

/** A row whose control is a switch; the whole row toggles it. */
export function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="ui-row ui-toggle-row" onClick={(e) => { if (!e.target.closest(".ui-switch")) onChange(!checked); }}>
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
  const v = Number(value ?? min);
  const pct = ((v - min) / Math.max(1e-9, max - min)) * 100;
  return (
    <div className="ui-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        style={{ "--pct": `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="ui-slider-value">{fmt ? fmt(v) : v}</span>
    </div>
  );
}

/** Segmented control. options: [{ value, label, icon? }] */
export function SegmentedControl({ value, options, onChange }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="ui-seg" role="radiogroup" style={{ "--n": options.length, "--i": idx }}>
      <span className="ui-seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
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

/** Small "?" that explains a setting on hover. */
export function HelpTip({ text }) {
  return (
    <span className="ui-help" title={text} aria-label={text} role="img">
      <Icon name="help" />
    </span>
  );
}

/** A plain heading inside a page, for the few places that are not groups. */
export function SectionTitle({ children }) {
  return <h2 className="ui-group-title">{children}</h2>;
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
  const cls = ["ui-btn", appearance ? `ui-btn-${appearance}` : "", size === "small" ? "ui-btn-sm" : "", !children ? "ui-btn-icon" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {glyph ? <span className="ui-btn-glyph">{glyph}</span> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

/** Outer container kept for API compatibility; renders its children only. */
export function Card({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

/** Passes children through (the old theme provider). */
export function FluentProvider({ children }) {
  return children;
}

const MenuCtx = createContext(null);

/** Menu = one trigger + one popover; closes on item click, outside click or Escape. */
export function Menu({ children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  return (
    <MenuCtx.Provider value={{ open, setOpen }}>
      <span className="ui-menu" ref={ref}>{children}</span>
    </MenuCtx.Provider>
  );
}

export function MenuTrigger({ children }) {
  const ctx = useContext(MenuCtx);
  return cloneElement(children, {
    "aria-haspopup": "menu",
    "aria-expanded": ctx.open,
    onClick: (e) => {
      children.props.onClick?.(e);
      ctx.setOpen((v) => !v);
    },
  });
}

export function MenuPopover({ children, className = "" }) {
  const ctx = useContext(MenuCtx);
  const ref = useRef(null);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    if (!ctx.open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setFlip(r.bottom > window.innerHeight - 8);
  }, [ctx.open]);
  if (!ctx.open) return null;
  return (
    <div ref={ref} className={"ui-menu-pop " + (flip ? "up " : "") + className}>
      {children}
    </div>
  );
}

export function MenuList({ children }) {
  return <div role="menu" className="ui-menu-list">{children}</div>;
}

export function MenuItem({ children, onClick }) {
  const ctx = useContext(MenuCtx);
  return (
    <button
      type="button"
      role="menuitem"
      className="ui-menu-item"
      onClick={(e) => {
        onClick?.(e);
        ctx.setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

/** Dropdown/Option pair backed by a native select. */
export function Dropdown({ selectedOptions, onOptionSelect, children, className = "" }) {
  const id = useId();
  const options = React.Children.toArray(children).map((c) => ({ value: c.props.value, label: c.props.children }));
  return (
    <span className={"ui-select " + className}>
      <select
        id={id}
        value={(selectedOptions && selectedOptions[0]) ?? ""}
        onChange={(e) => onOptionSelect?.(e, { optionValue: e.target.value })}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Icon name="chevron-down" />
    </span>
  );
}

export function Option() {
  return null;
}

// Fluent icon names the editor used, mapped onto the Booki icon set.
const glyph = (name) => {
  const C = () => <Icon name={name} />;
  C.displayName = `Glyph(${name})`;
  return C;
};
export const AddRegular = glyph("plus");
export const FolderRegular = glyph("folder");
export const FolderAddRegular = glyph("folder-plus");
export const LineHorizontal3Regular = glyph("list");
export const DeleteRegular = glyph("trash");
export const GridRegular = glyph("grid");
export const ListRegular = glyph("list");
export const ArrowUndo24Regular = glyph("take-out");
export const Flash24Regular = glyph("zap");
export const Info24Regular = glyph("info");
export const Search24Regular = glyph("search");
