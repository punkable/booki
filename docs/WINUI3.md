# Booki Dock: WinUI 3 generation

Booki now has two deliberately separate Windows applications.

## Booki Legacy

The existing Tauri, Rust, React and WebView2 application remains at the repository
root. Its product name is Booki Legacy, and it continues to use the current
NSIS/MSI updater while the native generation reaches feature parity.

## Booki Dock

The native application lives in src-winui/Booki.Dock and is included in
Booki.slnx.

- UI: WinUI 3 and XAML
- Runtime: .NET 10
- Platform: Windows App SDK 2.2
- Distribution target: single-project MSIX
- Package identity: Punkable.BookiDock
- Settings: %LOCALAPPDATA%\Booki\Dock\settings.json

The first launch can import compatible apps and preferences from
%APPDATA%\Booki\config.json. Import is one-way and never modifies Legacy.

## Current native foundation

- Mica settings window with NavigationView
- Separate Acrylic dock window
- General, Appearance, Behavior, Pinned Apps and About pages
- Native file picker and context flyouts
- Launch and remove pinned applications
- Legacy configuration migration
- Independent GitHub Actions build

## Development

Install the .NET 10 SDK and WinUI CLI templates:

    dotnet new install Microsoft.WindowsAppSDK.WinUI.CSharp.Templates
    dotnet build src-winui/Booki.Dock/Booki.Dock.csproj -c Debug -r win-x64

dotnet run for packaged WinUI development requires Windows Developer Mode.
Do not enable it automatically on user machines.

## Compatibility roadmap

Before Booki Dock replaces Legacy, it still needs native implementations for
auto-hide/notch coordination, magnification physics, widgets, drag-and-drop,
running-app indicators, global shortcuts, multi-monitor anchoring, updater UX
and signed MSIX publishing.
