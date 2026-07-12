using Booki_Dock.Services;
using Microsoft.UI.Xaml;

namespace Booki_Dock;

public partial class App : Application
{
    public static SettingsStore Store { get; } = new();
    public static MainWindow SettingsWindow { get; private set; } = null!;
    private static DockWindow? _dockWindow;

    public App() => InitializeComponent();

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        await Store.LoadAsync();
        RequestedTheme = Store.Value.Theme switch
        {
            "Light" => ApplicationTheme.Light,
            "Dark" => ApplicationTheme.Dark,
            _ => RequestedTheme
        };
        SettingsWindow = new MainWindow();
        SettingsWindow.Activate();
        _dockWindow = new DockWindow();
        _dockWindow.Activate();
    }

    public static void RefreshDock() => _dockWindow?.Refresh();

    public static void ShowSettings()
    {
        SettingsWindow.Activate();
    }
}
