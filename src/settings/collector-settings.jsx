import React from "react";
import { pickFolder } from "../api.js";
import { t } from "../i18n.js";
import { Row, SegmentedControl } from "./ui.jsx";

export function CollectorSettings({ cfg, set }) {
  return <div className="collector-preferences">
    <Row label={t("refine.saveFolder")} hint={cfg.collectorDirectory || t("refine.systemDownloads")}>
      <button type="button" className="button" onClick={async () => { const folder = await pickFolder(); if (folder) set({ collectorDirectory: folder }); }}>{t("m.addFolder")}</button>
      {cfg.collectorDirectory && <button type="button" className="button" onClick={() => set({ collectorDirectory: "" })}>{t("refine.systemDownloads")}</button>}
    </Row>
    <Row label={t("refine.defaultFormat")}>
      <SegmentedControl value={cfg.collectorFormat || "video"} onChange={(value) => set({ collectorFormat: value })}
        options={[{ value: "video", label: t("dl.video") }, { value: "audio", label: t("dl.audio") }]} />
    </Row>
  </div>;
}
