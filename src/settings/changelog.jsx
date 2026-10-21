/* "What's new", as a dialog inside Settings. The full history is a large
   module, loaded only when the dialog opens. */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n.js";
import { currentRelease, formatReleaseDate, previousReleases } from "../release-notes.js";
import { Icon, useModalControls } from "./ui.jsx";
import { isotype } from "../brand-mark.js";

const ICONS = { settings: "settings", sparkles: "sparkles", search: "search", undo: "take-out", performance: "zap" };

function SectionIcon({ name }) {
  return <Icon name={ICONS[name] || "info"} className="release-icon" />;
}

function Release({ entry }) {
  return entry.sections.map((section, index) => <section key={index} className="release-section">
    <h3><SectionIcon name={section.icon} />{section.title}</h3>
    <ul>{section.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
  </section>);
}

function History({ older }) {
  const [open, setOpen] = useState(false);
  if (!older.length) return null;
  return <details className="release-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t("overhaul.history")}</summary>
    {open && older.map((entry) => <HistoricalRelease key={entry.version} entry={entry} />)}
  </details>;
}

function HistoricalRelease({ entry }) {
  const [open, setOpen] = useState(false);
  return <details className="release-history-entry" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><strong>v{entry.version}</strong><span>{formatReleaseDate(entry.date)}</span><span>{entry.headline}</span></summary>
    {open && <Release entry={entry} />}
  </details>;
}

export function ChangelogModal({ onClose }) {
  useModalControls(onClose);
  const [history, setHistory] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    import("../changelog-data.js").then((m) => alive && setHistory(m.CHANGELOG)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [attempt]);
  const latest = currentRelease();
  const older = [...new Map([...previousReleases(), ...(history || [])]
    .filter((entry) => entry.version !== latest.version)
    .map((entry) => [entry.version, entry])).values()];
  return createPortal(<div className="modal-scrim" onClick={onClose}>
    <div className="modal release-modal" role="dialog" aria-modal="true" aria-label={t("cl.title")} onClick={(e) => e.stopPropagation()}>
      <header className="modal-head">
        <h2><img src={isotype} alt="" />{t("cl.title")}</h2>
        <button type="button" className="icon-button" aria-label={t("stack.close")} onClick={onClose}><Icon name="x" /></button>
      </header>
      <div className="modal-body">
        <p className="release-meta"><span className="badge">v{latest.version}</span><span>{formatReleaseDate(latest.date)}</span></p>
        {latest.headline && <p className="release-headline">{latest.headline}</p>}
        <Release entry={latest} />
        {history === null && !failed && <p role="status">{t("overhaul.loading")}</p>}
        {failed && <button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>{t("focus.retry")}</button>}
        <History older={older} />
      </div>
      <footer className="modal-foot"><button type="button" className="button button-accent" onClick={onClose}>{t("cl.ok")}</button></footer>
    </div>
  </div>, document.body);
}
