/* Profile and backup UI; snapshot operations share the root save barrier. */
import React, { useEffect, useRef, useState } from "react";
import { dock as dockApi, pickSavePath, pickJsonFile } from "../api.js";
import { Inspector } from "./inspector.jsx";
import { DockPreview } from "./dock-preview.jsx";
import { SnapshotReview } from "./snapshot-review.jsx";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { countContent } from "../dock/layout-model.js";
import { Button, PageHeader, CollapsibleSection } from "./ui.jsx";

// Saved profiles include general preferences; preview before replacing the live configuration.
function ProfilesCard({ cfg, onApply, beforeSnapshot }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [profiles, setProfiles] = useState([]), [deleted, setDeleted] = useState([]);
  const [name, setName] = useState(""), [targetName, setTargetName] = useState(""), [selected, setSelected] = useState("");
  const [profileRevision, setProfileRevision] = useState(0);
  const [preview, setPreview] = useState(null), [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false), [overwrite, setOverwrite] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const previewKey = useRef(null);
  const alive = useRef(false), refreshId = useRef(0), actionBusy = useRef(false), origin = useRef(null);
  const refresh = async () => {
    const id = ++refreshId.current;
    const [list, archive] = await Promise.all([dockApi.profileList(), dockApi.profileDeleted()]);
    if (alive.current && id === refreshId.current) { setProfiles(list || []); setDeleted(archive || []); setProfileRevision(value => value + 1); }
  };
  const action = async (fn) => {
    if (actionBusy.current) return; actionBusy.current = true; setBusy(true); setError("");
    try { await fn(); } catch (e) {
      if (alive.current) setError(t(String(e).includes("BOOKI_PROFILE_EXISTS") ? "integral.profileExists" : String(e).includes("BOOKI_PROFILE_NAME_INVALID") ? "integral.profileNameInvalid" : "overhaul.failed"));
      // A failed multi-document operation can leave a complete recovery copy.
      // Reflect the actual files while retaining the error and the entered name.
      await refresh().catch(() => {});
    }
    finally { actionBusy.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    alive.current = true; refresh().catch(() => { if (alive.current) setError(t("overhaul.failed")); });
    return () => { alive.current = false; refreshId.current++; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (previewKey.current !== selected) setPreview(null);
    previewKey.current = selected;
    if (!selected) { setLoading(false); return; }
    setLoading(true);
    dockApi.profilePreview(selected).then(value => { if (!cancelled) setPreview(value); })
      .catch(() => { if (!cancelled) { setError(t("overhaul.failed")); setPreview(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, profileRevision]);
  const active = cfg?.lastProfile || "";
  const counts = preview ? countContent(preview.config.pinned) : null;
  return <section className="profiles-section" aria-label={t("prof.title")}>
    {review && <SnapshotReview current={cfg} snapshot={review.config} onClose={() => setReview(null)} onConfirm={() => onApply(review.name, review.config)} />}
    <div className="profiles-toolbar"><h2>{t("prof.title")} <span>{profiles.length}</span></h2>
      <div className="prof-new"><input className="text-field" aria-label={t("prof.name")} placeholder={t("prof.name")} value={name} maxLength={40} onChange={e => { setName(e.target.value); setOverwrite(""); }} />
        <button className="button button-accent" disabled={busy || !name.trim()} onClick={() => {
          if (profiles.some(n => n.toLowerCase() === name.trim().toLowerCase()) && overwrite !== name.trim()) { setOverwrite(name.trim()); return; }
          action(async () => { await beforeSnapshot(); await dockApi.profileSave(name.trim(), overwrite === name.trim()); setName(""); setOverwrite(""); await refresh(); });
        }}>{t(overwrite === name.trim() && name.trim() ? "integral.overwriteProfile" : "prof.save")}</button>
      </div>
    </div>
    {error && <div className="profile-error" role="alert"><span>{error}</span><button className="button" disabled={busy} onClick={() => action(refresh)}>{t("apps.refresh")}</button></div>}
    <div className="profile-list" aria-label={t("prof.title")}>
      {!profiles.length && <p className="profile-empty">{t("design.profileEmpty")}</p>}
      {profiles.map(n => <div className={"profile-record" + (n === selected ? " selected" : "")} key={n}>
        <button className="profile-choice" aria-pressed={n === selected} disabled={busy} onClick={event => { origin.current = event.currentTarget; setError(""); setSelected(n); setManageOpen(false); setTargetName(""); }}>
          <span dangerouslySetInnerHTML={{ __html: icon("copy") }} /><span className="prof-name">{n}</span>{n === active && <span className="profile-active-mark" dangerouslySetInnerHTML={{ __html: icon("check") }} />}<span className="profile-open-mark" dangerouslySetInnerHTML={{ __html: icon("chevron-right") }} />
        </button>
        {n === selected && <Inspector className="profile-inspector" selectionKey={selected} origin={origin} onBack={() => setSelected("")}>
          <h3 className="booki-sr-only">{selected}</h3>
          {loading && <p role="status">{t("overhaul.loading")}</p>}
          {preview && <><div className="profile-preview-line"><DockPreview cfg={preview.config} />
            <div className="profile-summary"><span>{counts.apps} {t("overhaul.apps")} · {counts.widgets} {t("tab.widgets")} · {counts.groups} {t("overhaul.groups")}</span><span>{t(`edge.${preview.config.edge || "bottom"}`)} · {t(`theme.${preview.config.theme || "system"}`)}</span><small>{t("design.profileScope")}</small></div>
            <div className="workspace-actions"><button className="button button-accent" disabled={busy || loading} onClick={() => setReview({ ...preview, name:selected })}>{t("prof.apply")}</button>
              <button className="button" disabled={busy} onClick={() => action(async () => { await dockApi.profileDelete(selected); setSelected(""); await refresh(); })}>{t("apps.remove")}</button></div>
          </div>{preview.recovered && <p role="status">{t("integral.profileRecovered")}</p>}
            <details className="profile-manage" open={manageOpen} onToggle={event => setManageOpen(event.currentTarget.open)}><summary>{t("design.manageProfile")}</summary>
              <div className="profile-manage-controls"><input className="text-field" aria-label={t("integral.renameProfile")} placeholder={t("prof.name")} value={targetName} maxLength={40} onChange={e => setTargetName(e.target.value)} />
                <button className="button" disabled={busy || !targetName.trim()} onClick={() => action(async () => { await dockApi.profileDuplicate(selected, targetName.trim()); setTargetName(""); await refresh(); })}>{t("integral.duplicateProfile")}</button>
                <button className="button" disabled={busy || !targetName.trim() || targetName.trim() === selected} onClick={() => action(async () => { const target = targetName.trim(); await dockApi.profileRename(selected, target); setTargetName(""); setSelected(target); await refresh(); })}>{t("integral.renameProfile")}</button>
              </div>
            </details>
          </>}
        </Inspector>}
      </div>)}
    </div>
    {deleted.length > 0 && <CollapsibleSection title={t("integral.deletedProfiles")} icon="copy" count={deleted.length}>
      {deleted.map(entry => <div className="prof-row" key={entry.token}><span className="prof-name">{entry.name}</span><button className="button" disabled={busy} onClick={() => action(async () => { await dockApi.profileRestore(entry.token); await refresh(); })}>{t("integral.restoreProfile")}</button></div>)}
    </CollapsibleSection>}
  </section>;

}

export function ProfilesPage({ cfg, onApply, beforeSnapshot, onImport, embedded = false }) {
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
      {embedded ? <h2 className="ui-group-title" data-setting-label={t("tab.profiles")}>{t("tab.profiles")}</h2> : <PageHeader title={t("tab.profiles")}>{t("prof.hint")}</PageHeader>}
      <ProfilesCard cfg={cfg} onApply={onApply} beforeSnapshot={beforeSnapshot} />
      <section className="profile-backup"><div><h2>{t("ap.backup")}</h2><p role="status">{backupMsg || t("design.backupHint")}</p></div><div className="workspace-actions">

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

      </div></section>
    </>
  );
}

