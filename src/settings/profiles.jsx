/* Profile and backup UI; snapshot operations share the root save barrier. */
import React, { useEffect, useRef, useState } from "react";
import { dock as dockApi, pickSavePath, pickJsonFile } from "../api.js";
import { Inspector } from "./inspector.jsx";
import { DockPreview } from "./dock-preview.jsx";
import { SnapshotReview } from "./snapshot-review.jsx";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { Button, Row, PageHeader, SettingsSection, CollapsibleSection } from "./ui.jsx";

// Saved profiles include general preferences; preview before replacing the live configuration.
function ProfilesCard({ cfg, onApply, beforeSnapshot }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [profiles, setProfiles] = useState([]), [deleted, setDeleted] = useState([]);
  const [name, setName] = useState(""), [targetName, setTargetName] = useState(""), [selected, setSelected] = useState("");
  const [profileRevision, setProfileRevision] = useState(0);
  const [preview, setPreview] = useState(null), [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false), [overwrite, setOverwrite] = useState("");
  const alive = useRef(false), refreshId = useRef(0), actionBusy = useRef(false), origin = useRef(null);
  const refresh = async () => {
    const id = ++refreshId.current;
    const [list, archive] = await Promise.all([dockApi.profileList(), dockApi.profileDeleted()]);
    if (alive.current && id === refreshId.current) { setProfiles(list || []); setDeleted(archive || []); setProfileRevision(value => value + 1); }
  };
  const action = async (fn) => {
    if (actionBusy.current) return; actionBusy.current = true; setBusy(true); setError("");
    try { await fn(); } catch (e) { if (alive.current) setError(t(String(e).includes("BOOKI_PROFILE_EXISTS") ? "integral.profileExists" : String(e).includes("BOOKI_PROFILE_NAME_INVALID") ? "integral.profileNameInvalid" : "overhaul.failed")); }
    finally { actionBusy.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    alive.current = true; refresh().catch(() => { if (alive.current) setError(t("overhaul.failed")); });
    return () => { alive.current = false; refreshId.current++; };
  }, []);
  useEffect(() => {
    let cancelled = false; setPreview(null);
    if (!selected) { setLoading(false); return; }
    setLoading(true); setError("");
    dockApi.profilePreview(selected).then(value => { if (!cancelled) setPreview(value); })
      .catch(() => { if (!cancelled) setError(t("overhaul.failed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, profileRevision]);
  const active = cfg?.lastProfile || "";
  return <CollapsibleSection title={t("prof.title")} icon="copy" hint={t("prof.hint")} count={profiles.length || null} defaultOpen={true} className="profiles-section">
    {review && <SnapshotReview current={cfg} snapshot={review.config} onClose={() => setReview(null)} onConfirm={() => onApply(review.name, review.config)} />}
    {error && <p role="alert">{error}</p>}
    <div className="profile-workspace">
      <div className="profile-list" aria-label={t("prof.title")}>
        {profiles.map(n => <button key={n} className={"s-btn s-btn-soft profile-choice" + (n === selected ? " selected" : "")} aria-pressed={n === selected} disabled={busy} onClick={event => { origin.current = event.currentTarget; setSelected(n); }}><span>{n}</span>{n === active && <span dangerouslySetInnerHTML={{ __html: icon("check") }} />}</button>)}
      </div>
      {selected && <Inspector className="profile-inspector" selectionKey={selected} origin={origin} onBack={() => setSelected("")}>
        <h3>{selected}</h3>
        {loading && <p role="status">{t("overhaul.loading")}</p>}
        {preview && <><DockPreview cfg={preview.config} />{preview.recovered && <p role="status">{t("integral.profileRecovered")}</p>}
          <div className="workspace-actions"><button className="s-btn" disabled={busy} onClick={() => setReview({ ...preview, name:selected })}>{t("prof.apply")}</button>
            <button className="s-btn s-btn-soft" disabled={busy} onClick={() => action(async () => { await dockApi.profileDelete(selected); setSelected(""); await refresh(); })}>{t("apps.remove")}</button></div>
          <Row label={t("prof.name")}><input className="sugg-search" aria-label={t("integral.renameProfile")} value={targetName} maxLength={40} onChange={e => { setTargetName(e.target.value); }} /><button className="s-btn s-btn-soft" disabled={busy || !targetName.trim()} onClick={() => action(async () => { await dockApi.profileDuplicate(selected, targetName.trim()); setTargetName(""); await refresh(); })}>{t("integral.duplicateProfile")}</button><button className="s-btn s-btn-soft" disabled={busy || !targetName.trim() || targetName.trim() === selected} onClick={() => action(async () => { const target = targetName.trim(); await dockApi.profileRename(selected, target); setTargetName(""); setSelected(target); await refresh(); })}>{t("integral.renameProfile")}</button></Row>
        </>}
      </Inspector>}
    </div>
    <div className="prof-row prof-new"><input className="sugg-search" aria-label={t("prof.name")} placeholder={t("prof.name")} value={name} maxLength={40} onChange={e => { setName(e.target.value); setOverwrite(""); }} />
      <button className="s-btn" disabled={busy || !name.trim()} onClick={() => {
        if (profiles.some(n => n.toLowerCase() === name.trim().toLowerCase()) && overwrite !== name.trim()) { setOverwrite(name.trim()); return; }
        action(async () => { await beforeSnapshot(); await dockApi.profileSave(name.trim(), overwrite === name.trim()); setName(""); setOverwrite(""); await refresh(); });
      }}>{t(overwrite === name.trim() && name.trim() ? "integral.overwriteProfile" : "prof.save")}</button>
    </div>
    {deleted.length > 0 && <CollapsibleSection title={t("integral.deletedProfiles")} icon="copy" count={deleted.length}>
      {deleted.map(entry => <div className="prof-row" key={entry.token}><span className="prof-name">{entry.name}</span><button className="s-btn s-btn-soft" disabled={busy} onClick={() => action(async () => { await dockApi.profileRestore(entry.token); await refresh(); })}>{t("integral.restoreProfile")}</button></div>)}
    </CollapsibleSection>}
  </CollapsibleSection>;
}

export function ProfilesPage({ cfg, onApply, beforeSnapshot, onImport }) {
  const [backupMsg, setBackupMsg] = useState("");
  const [review, setReview] = useState(null);
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const flash = (msg) => {
    setBackupMsg(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setBackupMsg(""), 3200);
  };
  return (
    <>
      {review && <SnapshotReview current={cfg} snapshot={review.snapshot} onClose={() => setReview(null)} onConfirm={async () => { await onImport(review.path,review.snapshot);flash(t("ap.backupImported")); }} />}
      <PageHeader title={t("tab.profiles")}>{t("ap.backupHint")}</PageHeader>
      <ProfilesCard cfg={cfg} onApply={onApply} beforeSnapshot={beforeSnapshot} />
      <SettingsSection title={t("ap.backup")} hint={backupMsg || t("ap.backupKeep")}>
        <Row label={t("ap.export")}>
          <Button
            onClick={async () => {
              try {
                const p = await pickSavePath("booki-config.json");
                if (!p) return;
                await beforeSnapshot();
                await dockApi.exportConfig(p);
                flash(t("ap.backupExported"));
              } catch (_) {
                flash(t("ap.backupError"));
              }
            }}
          >
            {t("ap.export")}
          </Button>
        </Row>
        <Row label={t("ap.import")}>
          <Button
            onClick={async () => {
              try {
                const p = await pickJsonFile();
                if (!p) return;
                const snapshot = await dockApi.previewImport(p);
                if (!snapshot || !Array.isArray(snapshot.pinned)) throw new Error('Invalid import');
                setReview({ path:p,snapshot });
              } catch (_) {
                flash(t("ap.backupError"));
              }
            }}
          >
            {t("ap.import")}
          </Button>
        </Row>
      </SettingsSection>
    </>
  );
}

