import React, { useState } from "react";
import { pickFolder } from "../api.js";
import { t } from "../i18n.js";
import { COLLECTOR_QUALITIES, collectorPreferences } from "../collector-preferences.js";
import { Row, SegmentedControl, Select } from "./ui.jsx";

export function CollectorSettings({ cfg, set }) {
  const preferences = collectorPreferences(cfg);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const chooseFolder = async () => {
    setBusy(true); setError("");
    try { const folder = await pickFolder(); if (folder) set({ collectorDirectory: folder }); }
    catch (_) { setError(t("overhaul.failed")); }
    finally { setBusy(false); }
  };
  return <div className="collector-preferences">
    {error && <p className="notice-error" role="alert">{error}</p>}
    <Row label={t("refine.saveFolder")} hint={cfg.collectorDirectory || t("refine.systemDownloads")}>
      <button type="button" className="button" disabled={busy} onClick={chooseFolder}>{t("m.addFolder")}</button>
      {cfg.collectorDirectory && <button type="button" className="button" onClick={() => set({ collectorDirectory: "" })}>{t("refine.systemDownloads")}</button>}
    </Row>
    <Row label={t("refine.defaultFormat")}>
      <SegmentedControl value={preferences.format} onChange={(value) => set({ collectorFormat: value })}
        options={[{ value: "video", label: t("dl.video") }, { value: "audio", label: t("dl.audio") }]} />
    </Row>
    <Row label={t("refine.quality")} hint={t("refine.qualityHint")}>
      <Select label={t("refine.quality")} value={preferences.quality} onChange={(value) => set({ collectorQuality: value })}
        options={COLLECTOR_QUALITIES.map((value) => ({ value, label: value === "best" ? t("refine.bestQuality") : `${value}p` }))} />
    </Row>
  </div>;
}
