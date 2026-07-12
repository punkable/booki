using Booki_Dock.Models;
using Booki_Dock.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Booki_Dock;

public partial class App : Application
{
    private static readonly SingleInstanceService Instance = new();
    public static SettingsStore Store { get; } = new();
    public static MainWindow? SettingsWindow { get; private set; }
    private static DispatcherQueue? _dispatcher;
    private static DockWindow? _dockWindow;
    private static NotchWindow? _notchWindow;

    public App() => InitializeComponent();

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        var launchArgs = Environment.GetCommandLineArgs().Skip(1).ToArray();
        if (!Instance.Acquire())
        {
            await SingleInstanceService.SendAsync(launchArgs);
            Exit();
            return;
        }

        _dispatcher = DispatcherQueue.GetForCurrentThread();
        Instance.Listen(received => _dispatcher.TryEnqueue(() => _ = HandleArgumentsAsync(received)));
        await Store.LoadAsync();
        ContextMenuService.Sync(Store.Value.ContextMenu);
        ApplyAccent(Store.Value.Accent);

        _dockWindow = new DockWindow();
        _dockWindow.Activate();
        _notchWindow = new NotchWindow();
        _notchWindow.AppWindow.Hide();

        await HandleArgumentsAsync(launchArgs);
        if (Store.Value.Pinned.Count == 0 || launchArgs.Contains("--settings", StringComparer.OrdinalIgnoreCase))
            OpenSettings();
    }

    public static void OpenSettings(string section = "general")
    {
        if (SettingsWindow is null)
        {
            SettingsWindow = new MainWindow();
            SettingsWindow.Closed += (_, _) => SettingsWindow = null;
        }
        SettingsWindow.Activate();
        SettingsWindow.NavigateTo(section);
    }

    public static void RefreshDock() => _dockWindow?.Refresh();

    public static void SetDockAlwaysOnTop(bool value)
    {
        if (_dockWindow?.AppWindow.Presenter is OverlappedPresenter dock) dock.IsAlwaysOnTop = value;
        if (_notchWindow?.AppWindow.Presenter is OverlappedPresenter notch) notch.IsAlwaysOnTop = value;
    }

    public static void ApplyAccent(string accent)
    {
        try
        {
            Current.Resources["BookiAccentBrush"] = new Microsoft.UI.Xaml.Media.SolidColorBrush(ColorHelper.ToColor(accent));
        }
        catch { }
    }

    public static async void HideDock()
    {
        if (_dockWindow is null || _notchWindow is null) return;
        await _dockWindow.HideToNotchAsync();
        _notchWindow.PositionNearDock();
        _notchWindow.AppWindow.Show();
    }

    public static void ShowDock()
    {
        if (_dockWindow is null || _notchWindow is null) return;
        _notchWindow.AppWindow.Hide();
        _dockWindow.ShowFromNotch();
    }

    public static void Quit()
    {
        Instance.Dispose();
        Current.Exit();
    }

    private static async Task HandleArgumentsAsync(string[] args)
    {
        var pinIndex = Array.FindIndex(args, value => value.Equals("--pin", StringComparison.OrdinalIgnoreCase));
        if (pinIndex >= 0 && pinIndex + 1 < args.Length)
        {
            var path = args[pinIndex + 1];
            if (!Store.Value.Pinned.Any(item => string.Equals(item.Path, path, StringComparison.OrdinalIgnoreCase)))
            {
                Store.Value.Pinned.Add(new PinnedItem
                {
                    Name = Path.GetFileNameWithoutExtension(path.TrimEnd(Path.DirectorySeparatorChar)),
                    Path = path
                });
                await Store.SaveAsync();
                RefreshDock();
            }
        }
        if (args.Contains("--settings", StringComparer.OrdinalIgnoreCase)) OpenSettings();
    }
}

internal static class ColorHelper
{
    public static Windows.UI.Color ToColor(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length != 6) throw new FormatException("Invalid color");
        return Windows.UI.Color.FromArgb(255,
            Convert.ToByte(hex[..2], 16), Convert.ToByte(hex[2..4], 16), Convert.ToByte(hex[4..6], 16));
    }
}
