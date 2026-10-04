# CoolDock research and Booki decisions

Reviewed on 4 October 2026. Reference product: [CoolDock](https://cooldock.app), a macOS utility. Booki continues to use Tauri and Windows APIs; no WinUI framework, paid edition or macOS code is being added.

## Evidence

- [Product page](https://cooldock.app): a customizable dock, widgets, multiple layouts and coexistence with the system dock. Promotional testimonials are selected by the publisher and are not an independent review sample.
- [Appearance documentation](https://cooldock.app/docs/appearance): separate application theme and dock appearance, materials, spacing, size, density and overflow behavior.
- [Layout documentation](https://cooldock.app/docs/layout): edges, reveal behavior and layouts suited to different desktop contexts.
- [Uneed listing and review](https://www.uneed.best/tool/cooldock): one visible public review by Tsutsu values coexistence with the original dock and easy switching between work/personal profiles with gestures or hotkeys. Listing feature counts are marketing claims, not verified usage or reliability measurements. Upvotes are not downloads.

The independent review sample is small. A Google search for Reddit reviews was blocked by a traffic challenge; no consensus or reliability conclusion is inferred from it.

## Applied to Booki

| Observed strength | Windows implementation |
|---|---|
| Quiet visual hierarchy and coordinated materials | White Settings surfaces, restrained depth, light/dark finishes and explicit Light Glass, Mica, Tinted Glass and Pure presets |
| One understandable way to add things | Shared app identity and candidate sections in Settings and the dock; searchable installed/running/frequent apps, bulk selection, folders and widget gallery |
| Work/personal layouts | Existing scenario presets and profiles retained; profile operations now wait for settings to save and expose failures |
| System coexistence | Preserve taskbar cooperation, Show Desktop recovery, per-monitor positioning, explicit reveal and fullscreen behavior |
| Useful widgets with local interactions | Timer restart, editable tasks, calendar navigation and weather units; no account required |
| Small, focused settings | Interactive preview, control-level search navigation, disclosures and narrow-window layouts |

Native Windows app discovery uses the Start Menu and AppsFolder. UserAssist and successful local Booki launches supply usage and recency signals. Recommendation controls can disable history-based suggestions, hide suggestions and clear Booki's own launch history without changing Windows history. Shortcut identity retains target arguments and working directory rather than assuming that matching labels identify the same app.

Materials retain Windows capability fallbacks and reduced-transparency support. Browser captures illustrate the actual frontend with fixtures; they do not demonstrate native acrylic/Mica composition.
