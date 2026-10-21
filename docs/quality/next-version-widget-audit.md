# Widget audit and next-version decisions

Reviewed 21 October 2026 against the 0.94.0 baseline and the user's next-version brief.
These are source and interface findings, not device-lab measurements or telemetry.

All work stays in **one new large release**, as explicitly requested. Branch
commits and review fixes are not separate product updates; do not publish
intermediate versions.

The user also explicitly requested batching validation: complete the full set of
changes locally before a single final validation round and branch sync. Do not
push each implementation increment, because PR synchronization starts hosted CI.
Keep the repository's required checks intact; this is a work-order decision, not
permission to bypass release verification.

## Direction agreed with the user

Booki is an intelligent dock that coexists with the Windows taskbar. Refine its
own identity through Fluent typography, materials, restrained transitions and
predictable interactions. Keep one dock fixed to a display, movable to another.
Profiles remain optional and may vary content, appearance, behavior and display.
Do not add nested groups, notification history or more notification switches.
Keep the idle notch as a dot and active agents as logo plus state. Introduce
music briefly, retain discreet controls on demand, and rotate relevant activity.
Preserve curated colors, provider logos and the credential-free local readers.

## Catalog audit

There are **15 active widgets**. No evidence justifies removing a capability for
all users based on one person's frequency of use. Keep the catalog; improve
discoverability and make optional integrations clear. Widget widths were already
selectable; retain that control instead of introducing another size system.

| Widget | Role and finding | Decision |
| --- | --- | --- |
| Clock | Fast glance; overlaps calendar only in its expanded view | Keep both; preserve the calendar shortcut |
| Calendar | Month navigation; not a synchronized appointment/calendar service | Keep; do not imply account/event integration |
| Weather | Requires location selection and network forecast | Keep optional, explicit empty/location state |
| System | CPU/RAM/disk/network already consolidated | Keep metric selection; measure native sensor costs separately |
| Battery | PC battery; availability depends on hardware | Keep unknown/unavailable distinct from zero |
| Devices | Frequent daily use; Windows may cache values | Add clickable details with source and query time, plus a clear freshness caveat |
| AI | Plan quota and local consumption are different | Keep real Codex percentages; show approximate recorded Claude consumption, prioritize activity stages |
| Media | Fast transport controls; can compete with agents | Keep on-demand controls, brief start/track notices and long-pause retirement |
| Volume | Existing master and per-session mixer was hard to discover | Expose Audio controls from the dock menu and action launcher |
| Notes | Lightweight local scratchpad | Keep; include in common widget panel |
| Clipboard | Retention, favorites, sensitive-pattern guard and optional encrypted persistence | Keep privacy controls; reuse its existing live history panel |
| Focus | Timer and tasks already consolidated | Keep deadline-based timing and optional DND; rotate nonurgent notch activity |
| Collector | Video/audio-only appearance concealed files and galleries; no queue | Explicit modes, multiline input, bounded session queue, cancel/retry and saved-file actions |
| Updates | Installed-app updates via winget; distinct from Booki's updater | Keep separation and clarify dependency; retain existing applicability filtering |
| Lighting | Specialized OpenRGB integration | Keep optional; do not make it part of the default dock |

## Changes prepared on the next-version branch

- Dragging from groups: named cursor preview with an icon fallback, destination
  labels and dock insertion markers; prevent native image drags from cancelling
  pointer capture; Escape and lost capture cancel without moving the shortcut.
- Groups: search without recreating live cells; list/small/medium/large views;
  Ctrl+wheel density changes; persisted view; resolve current group by id when
  reopening; fixed toolbar and internal scrolling.
- Dock: smooth overflow scrolling that respects reduced motion; optional
  Integrated/Quiet/Expressive appearance presets preserve pins, screen and
  profiles; no overshooting magnification curve.
- Moving screens: the existing empty-dock drag can select the display under
  the native cursor on release, using physical coordinates to avoid JS DPI
  ambiguity. Cross-screen behavior still needs a Windows/manual DPI check.
- Notch: compact logo/status presentation, accessible full label, cached
  rotation among agents; brief music introductions also in editors; alternate
  a running timer with nonurgent agent work. Hovering working agents keeps
  recent music and its play/pause control available. Waiting/error stay higher
  priority.
- Widgets: common panel reuses live widget cards and existing details; direct
  mixer access; device details; recorded consumption clearly marked approximate.
- Launcher: searchable built-in audio, widgets, settings, playback and group
  actions. No arbitrary command execution or invented executable paths.
- Collector: separate queue state machine and panel; one native job at a time;
  job-scoped progress and cancellation; retry; 50-job session bound; explicit
  file/gallery/video/audio modes; shared folder/default-format preferences in
  Widgets and Plugins plus a gear disclosure in the panel. Completion exposes
  reveal/open/copy actions beside the dock or in an actionable notch popup,
  and in the result row. Folder, format and video quality preferences are shared.

## Deliberate boundaries

- No quota percentage is estimated from tokens: providers don't publish a
  universal subscription allowance. Approximate recorded use is not account-wide
  use and may omit activity on other machines.
- A device query timestamp means Booki queried its source; it is not a sensor
  measurement timestamp. No claim that MX Keys hardware freshness is solved.
- Cancel waits for native work to stop before the next job. Download tool
  processes are stopped as a tree on Windows. Direct HTTP downloads observe
  cancellation between body reads; a stalled network read can delay it.
- Reattempts may reuse partial yt-dlp files when the source supports it. There
  is no universal pause/resume guarantee. URLs/results remain in memory and
  aren't copied into persistent history; the queue ends when Booki closes.
- Gallery progress is indeterminate because the total count is unknown.
- Popup actions on the separate notch receive only an expiring opaque callback
  token and labels. Paths remain in the dock process; no persistent notice history.
- Multiple simultaneous docks, media-session picking, bulk selection inside a
  dock group and profile-scope redesign are not part of this first refinement.
  Existing profiles, schedules and editing mode remain available.
- A Fluent visual pass doesn't prove that native compositor flashes are gone.
  Validate actual opening/closing, display movement, DPI changes, suspend/resume,
  peripheral charge/disconnect and an installed upgrade on Windows.
- The public release remains 0.94.0. This batch targets **0.95.0**; versioned
  notes and source captures prepare that one release without publishing it.

## Validation

Exercise serial queue ownership, cancellation/retry and stale progress, group
view persistence and search, native command contracts, contextual agent rotation,
the live widget panel, shared preferences and the existing regression suite.
Keep reduced-motion, high-contrast and keyboard paths in the visual review.

### Evidence gathered before the batching instruction

- Full frontend suite: 332 tests passed with four test-file workers. An earlier
  run overlapped a rebuild and had a folder boot timeout; its isolated rerun and
  the later complete run passed.
- The final music-on-agent hover change and device/Collector preference paths:
  18 focused tests passed; build and lint passed.
- Rust formatting passed. A local Clippy attempt lacked GLib development files.
  A dependency-equipped Docker check was then started and deliberately stopped
  when the user requested deferring validation until the whole batch is ready.
  Native compilation/test success is therefore **not yet established**.
- Hosted CI runs triggered by incremental PR pushes were cancelled/requested to
  cancel after the batching instruction. Re-run the required validation once the
  remaining product batch is closed; do not infer success from a cancelled run.

### Final 0.95.0 validation

- Version agreement, ESLint, TypeScript, text encoding, icon contracts,
  publication privacy and five-language parity pass (1,074 translation keys).
- Native formatting and Clippy pass, with warnings denied. The native library
  suite passes **80 tests** in the dependency-equipped Linux container. Tauri's
  generated-schema directory must be writable; source stays mounted read-only.
- The first full browser run found an actual pointer-events inheritance bug in
  the new notch popup. Its buttons now opt into pointer events, and the popup
  regression checks the native 100px window height. The rebuilt frontend passes
  the complete **339-test** suite with four test-file workers (no skips).
- Both READMEs, versioned notes and all **12 source captures** pass the release
  documentation guard. Group/widget/Collector compositions were visually reviewed.
- Windows-specific compilation/packaging runs in the PR's required CI after
  the final batch sync. Hardware and installed-upgrade checks remain listed in
  [the Windows checklist](v0.95.0-windows-checklist.md).
