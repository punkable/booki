/* "What's new", as a dialog inside Settings. The full history is a large
   module, loaded only when the dialog opens. */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n.js";
import { currentRelease, previousReleases } from "../release-notes.js";
import { Icon, useModalControls } from "./ui.jsx";

const ICONS = { settings: "settings", sparkles: "sparkles", search: "search", undo: "take-out", performance: "zap" };

function SectionIcon({ name }) {
  if (name && /\p{Extended_Pictographic}/u.test(name)) return <span className="release-icon" aria-hidden="true">{name}</span>;
  return <Icon name={ICONS[name] || "info"} className="release-icon" />;
}

function Release({ entry }) {
  return entry.sections.map((section, index) => <section key={index} className="release-section">
    <h3><SectionIcon name={section.icon} />{section.title}</h3>
    <ul>{section.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
  </section>);
}

function HistoricalRelease({ entry }) {
  const [open, setOpen] = useState(false);
  return <details className="release-history-entry" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><strong>v{entry.version}</strong><span>{entry.date}</span><span>{entry.headline}</span></summary>
    {open && <Release entry={entry} />}
  </details>;
}

export function ChangelogModal({ onClose }) {
  useModalControls(onClose);
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let alive = true;
    import("../changelog-data.js").then((m) => alive && setHistory(m.CHANGELOG)).catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, []);
  const latest = currentRelease();
  const older = [...previousReleases(), ...(history || [])];
  return createPortal(<div className="modal-scrim" onClick={onClose}>
    <div className="modal release-modal" role="dialog" aria-modal="true" aria-label={t("cl.title")} onClick={(e) => e.stopPropagation()}>
      <header className="modal-head">
        <h2><img src="/brand/svg/isotype.svg" alt="" />{t("cl.title")}</h2>
        <button type="button" className="icon-button" aria-label={t("stack.close")} onClick={onClose}><Icon name="x" /></button>
      </header>
      <div className="modal-body">
        <p className="release-meta"><span className="badge">v{latest.version}</span><span>{latest.date}</span></p>
        {latest.headline && <p className="release-headline">{latest.headline}</p>}
        <Release entry={latest} />
        {history !== null && older.length > 0 && <details className="release-history"><summary>{t("overhaul.history")}</summary>
          {older.map((entry) => <HistoricalRelease key={entry.version} entry={entry} />)}
        </details>}
      </div>
      <footer className="modal-foot"><button type="button" className="button button-accent" onClick={onClose}>{t("cl.ok")}</button></footer>
    </div>
  </div>, document.body);
}
