/* Profile and backup UI; snapshot operations share the root save barrier. */
import React, { useEffect, useState } from "react";
import { dock as dockApi, pickSavePath, pickJsonFile } from "../api.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { Button, Row, PageHeader, SettingsSection, CollapsibleSection } from "./ui.jsx";

// Saved dock profiles: whole-config snapshots you switch between in one click.
function ProfilesCard({ cfg, onApply, beforeSnapshot }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = async (fn) => { if (busy) return; setBusy(true); setError(""); try { await fn(); } catch (_) { setError(t("overhaul.failed")); } finally { setBusy(false); } };
  const [profiles, setProfiles] = useState([]);
  const [name, setName] = useState("");
  // Deleting a saved snapshot is irreversible: arm on first click (auto-disarms)
  // and only delete on an explicit second click — same forgiveness model as
  // "clear all pins" and factory reset.
  const [delArm, setDelArm] = useState("");
  useEffect(() => {
    if (!delArm) return;
    const id = setTimeout(() => setDelArm(""), 3500);
    return () => clearTimeout(id);
  }, [delArm]);
  const refresh = () => dockApi.profileList().then((p) => setProfiles(p || []));
  useEffect(() => {
    refresh().catch(() => setError(t("overhaul.failed")));
  }, []);
  const active = (cfg && cfg.lastProfile) || "";
  return (
    <CollapsibleSection
      title={t("prof.title")}
      icon="copy"
      hint={t("prof.hint")}
      count={profiles.length || null}
      defaultOpen={false}
      className="profiles-section"
    >
      {error && <p role="alert">{error}</p>}
      {profiles.map((n) => (
        <div key={n} className={"prof-row" + (n === active ? " prof-active" : "")}>
          <span className="prof-name">
            {n === active && (
              <span className="prof-check" dangerouslySetInnerHTML={{ __html: icon("check") }} />
            )}
            {n}
          </span>
          <button
            disabled={busy}
            className="s-btn s-btn-soft"
            onClick={async () => {
              await action(() => onApply(n));
            }}
          >
            {t("prof.apply")}
          </button>
          <button
            className={"s-btn " + (delArm === n ? "s-btn-danger" : "s-btn-soft")}
            disabled={busy}
            title={delArm === n ? t("prof.deleteConfirm") : t("apps.remove")}
            onClick={async () => {
              if (delArm !== n) return setDelArm(n);
              setDelArm("");
              await action(async () => { await dockApi.profileDelete(n); await refresh(); });
            }}
          >
            {delArm === n
              ? t("prof.deleteConfirm")
              : <span dangerouslySetInnerHTML={{ __html: icon("x") }} />}
          </button>
        </div>
      ))}
      <div className="prof-row prof-new">
        <input
          className="sugg-search"
          placeholder={t("prof.name")}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="s-btn"
          disabled={busy || !name.trim()}
          onClick={async () => {
            await action(async () => { await beforeSnapshot(); await dockApi.profileSave(name.trim()); setName(""); await refresh(); });
          }}
        >
          {t("prof.save")}
        </button>
      </div>
    </CollapsibleSection>
  );
}

export function ProfilesPage({ cfg, onApply, beforeSnapshot, onImport }) {
  const [backupMsg, setBackupMsg] = useState("");
  const flash = (msg) => {
    setBackupMsg(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setBackupMsg(""), 3200);
  };
  return (
    <>
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
                if (!window.confirm(t("ap.backupImportConfirm"))) return;
                const fresh = await onImport(p);
                if (fresh) {
                  flash(t("ap.backupImported"));
                } else {
                  flash(t("ap.backupError"));
                }
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

