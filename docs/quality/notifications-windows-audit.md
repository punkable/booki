# Notification and Windows audit — 0.96.0

## Corrections

- Dock notices were measured before appending action buttons. Their later height could extend over the bar. Measure completed content and observe size changes.
- Update and undo/download notices independently chose the same position. They now use one inward-facing lane, avoiding the bar, magnified tiles and one another on every edge.
- Dock transforms and changes in notice text/viewport could leave stale placement. Geometry follows relevant resize and motion events; there is no permanent notification polling loop.
- The update version was overwritten by a generic label whenever configuration was applied. Preserve the version and translate its label; add a dismiss button and report a failed Settings action.
- A notice action resolving after a newer notice arrived could hide that newer notice. Guard asynchronous completion against the active notice generation.
- Screen-change detection omitted the Windows work-area origin. Reposition when available left/top changes even if available width/height stays constant.

## Existing Windows contracts reviewed

Native notifications use the edition-specific AppUserModelID and escape XML. Do not disturb and fullscreen deferral remain in place. Native click-through reporting includes notice surfaces. Dev identifiers, data/startup entries, icons and updater exclusion remain separate from stable. Widget sound, power and date/time settings use native Windows settings links; media/mixer controls continue through the existing bridge.

## Verification and physical limits

Browser cases exercise actual update availability through a simulated updater bridge, download completion with three actions, all four dock edges with magnification, dismiss behavior, stale asynchronous actions and work-area-origin repositioning. Existing performance tests guard idle activity and hit-region traffic. Fixtures do not read user files or perform real downloads/updates.

Physical follow-up on Windows: receive an update while hovering the magnified bar; open a group and complete a download; move the taskbar between edges and monitors with different DPI; resize/reveal/tuck the dock; enable Do not disturb and fullscreen video/game; operate notification buttons with mouse and keyboard. Finally install the signed update from 0.95.1 and confirm restart and preserved configuration/backups. Linux browser tests and signed installer builds cannot establish these checks.
