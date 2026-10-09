/* Apps: everything pinned, plus the installed apps, folders and sites to add. */
import React from "react";
import { dock as dockApi } from "../../api.js";
import { LibraryWorkspace } from "../library-workspace.jsx";
import { IconPickerModal } from "../icon-picker.jsx";

// Scan the Start Menu once per Settings session (it extracts icons, which is
// slow); the page remounts on every visit.
let installed = null;
let installedAt = 0;
function installedAppsOnce(force = false) {
  if (force || !installed || Date.now() - installedAt > 60000) {
    installedAt = Date.now();
    installed = dockApi.listInstalledApps(force).catch((error) => {
      installed = null;
      throw error;
    });
  }
  return installed;
}

export function AppsPage(props) {
  return <LibraryWorkspace {...props} listInstalled={installedAppsOnce} iconPicker={IconPickerModal} />;
}
