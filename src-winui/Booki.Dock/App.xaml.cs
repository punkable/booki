using Booki_Dock.Services;
using Microsoft.UI.Xaml;

namespace Booki_Dock;

public partial class App : Application
{
    public static SettingsStore Store { get; } = new();
    public static MainWindow SettingsWindow { get; private set; } = null!;
    private static DockWindow? _dockWindow;

    public App()
    {
        InitializeComponent();
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        await Store.LoadAsync();
        SettingsWindow = new MainWindow();
        SettingsWindow.Activate();
        _dockWindow = new DockWindow();
        _dockWindow.Activate();
        _notchWindow = new NotchWindow();
        _notchWindow.AppWindow.Hide();
    }

    public static void RefreshDock() => _dockWindow?.Refresh();

    private static NotchWindow? _notchWindow;

    public static void HideDock()
    {
        if (_dockWindow is null || _notchWindow is null) return;
        _dockWindow.AppWindow.Hide();
        _notchWindow.PositionNearDock();
        _notchWindow.AppWindow.Show();
    }

    public static void ShowDock()
    {
        if (_dockWindow is null || _notchWindow is null) return;
        _notchWindow.AppWindow.Hide();
        _dockWindow.Position();
        _dockWindow.AppWindow.Show();
    }

}
