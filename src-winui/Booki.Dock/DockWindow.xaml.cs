using System.Diagnostics;
using Booki_Dock.Models;
using Booki_Dock.Services;
using Microsoft.UI.Composition;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Hosting;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Markup;
using Windows.Graphics;

namespace Booki_Dock;

public sealed partial class DockWindow : Window
{
    private readonly DispatcherTimer _runningTimer = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _hideTimer = new() { Interval = TimeSpan.FromMilliseconds(650) };
    private bool _transitioning;
    private bool _fullscreen;

    public DockWindow()
    {
        InitializeComponent();
        AppWindow.SetIcon("Assets/AppIcon.ico");
        AppWindow.IsShownInSwitchers = false;
        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.SetBorderAndTitleBar(false, false);
            presenter.IsResizable = false;
            presenter.IsMaximizable = false;
            presenter.IsMinimizable = false;
            presenter.IsAlwaysOnTop = App.Store.Value.AlwaysOnTop;
        }
        Refresh();
        Position();
        _runningTimer.Tick += (_, _) =>
        {
            RefreshRunningState();
            RefreshFullscreenState();
        };
        _runningTimer.Start();
        _hideTimer.Tick += (_, _) => { _hideTimer.Stop(); if (App.Store.Value.AutoHide) App.HideDock(); };
        DockSurface.Loaded += async (_, _) =>
        {
            await LoadIconsAsync();
            if (App.Store.Value.AutoHide) _hideTimer.Start();
        };
    }

    public void Refresh()
    {
        _hideTimer.Interval = TimeSpan.FromMilliseconds(Math.Clamp(App.Store.Value.AutoHideDelay, 150, 3000));
        ApplyAdaptiveTileSize();
        PinnedItems.ItemsSource = null;
        PinnedItems.ItemsSource = App.Store.Value.Pinned;
        DockSurface.CornerRadius = new CornerRadius(Math.Clamp(App.Store.Value.CornerRadius, 6, 24));
        ApplyOrientation();
        Position();
        _ = LoadIconsAsync();
    }

    public void Position()
    {
        var display = DisplayArea.Primary;
        var work = display.WorkArea;
        var vertical = App.Store.Value.Edge is "Left" or "Right";
        var count = Math.Max(1, App.Store.Value.Pinned.Count);
        var tileSize = App.Store.Value.Pinned.FirstOrDefault()?.TileSize ?? App.Store.Value.IconSize + 8;
        var tileHeight = App.Store.Value.Pinned.FirstOrDefault()?.TileHeight ?? tileSize;
        var length = 12 + count * (tileSize + Math.Clamp(App.Store.Value.Spacing, 0, 12));
        var width = vertical ? (int)tileSize + 12 : (int)Math.Min(length, work.Width - 24);
        var height = vertical ? (int)Math.Min(length, work.Height - 24) : (int)tileHeight + 12;
        var x = App.Store.Value.Edge switch
        {
            "Left" => work.X + 12,
            "Right" => work.X + work.Width - width - 12,
            _ => work.X + (work.Width - width) / 2
        };
        var y = App.Store.Value.Edge switch
        {
            "Top" => work.Y + 12,
            "Bottom" => work.Y + work.Height - height - 12,
            _ => work.Y + (work.Height - height) / 2
        };
        AppWindow.MoveAndResize(new RectInt32(x, y, width, height));
    }

    private void ApplyOrientation()
    {
        var orientation = App.Store.Value.Edge is "Left" or "Right" ? "Vertical" : "Horizontal";
        PinnedItems.ItemsPanel = (ItemsPanelTemplate)XamlReader.Load(
            $"<ItemsPanelTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><StackPanel Orientation='{orientation}' /></ItemsPanelTemplate>");
    }

    private void ApplyAdaptiveTileSize()
    {
        var work = WindowStateService.GetWorkArea(App.Store.Value.MonitorIndex);
        var vertical = App.Store.Value.Edge is "Left" or "Right";
        var available = (vertical ? work.Height : work.Width) - 36;
        var count = Math.Max(1, App.Store.Value.Pinned.Count);
        var requested = Math.Clamp(App.Store.Value.IconSize, 28, 64);
        var fitted = Math.Clamp((available / count) - 10, 28, requested);
        foreach (var item in App.Store.Value.Pinned) item.SetLayout(fitted, App.Store.Value.Spacing, App.Store.Value.ShowLabels);
    }

    private async Task LoadIconsAsync()
    {
        foreach (var item in App.Store.Value.Pinned) await LoadItemAsync(item);
    }

    private static async Task LoadItemAsync(PinnedItem item)
    {
        if (item.Kind == "widget")
        {
            item.SetWidgetDisplay(item.Widget == "clock" ? DateTime.Now.ToString("HH:mm") : item.Name);
            return;
        }
        if (item.Kind == "group")
        {
            foreach (var child in item.Children) await LoadItemAsync(child);
            return;
        }
        if (item.Kind != "separator") item.SetIcon(await AppIconService.LoadAsync(item.Path));
    }

    private void RefreshRunningState()
    {
        var running = Process.GetProcesses()
            .Select(process => process.ProcessName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var item in App.Store.Value.Pinned)
        {
            if (item.Kind == "widget" && item.Widget == "clock") item.SetWidgetDisplay(DateTime.Now.ToString("HH:mm"));
            var name = Path.GetFileNameWithoutExtension(item.Path);
            item.SetRunning(App.Store.Value.ShowIndicators && !string.IsNullOrWhiteSpace(name) && running.Contains(name));
        }
    }

    private void RefreshFullscreenState()
    {
        var fullscreen = WindowStateService.IsForegroundFullscreen();
        if (fullscreen == _fullscreen) return;
        _fullscreen = fullscreen;
        App.SetFullscreenMode(fullscreen);
    }
    private void DockSurface_PointerEntered(object sender, PointerRoutedEventArgs e) => _hideTimer.Stop();
    private void DockSurface_PointerExited(object sender, PointerRoutedEventArgs e)
    {
        if (App.Store.Value.AutoHide) _hideTimer.Start();
    }

    private void Tile_PointerEntered(object sender, PointerRoutedEventArgs e)
    {
        if (!App.Store.Value.Magnification || sender is not UIElement element) return;
        AnimateScale(element, 1.16f);
    }

    private void Tile_PointerExited(object sender, PointerRoutedEventArgs e)
    {
        if (sender is UIElement element) AnimateScale(element, 1f);
    }

    public async Task HideToNotchAsync()
    {
        if (_transitioning || !AppWindow.IsVisible) return;
        _transitioning = true;
        var visual = ElementCompositionPreview.GetElementVisual(DockSurface);
        visual.CenterPoint = new System.Numerics.Vector3(
            (float)DockSurface.ActualSize.X / 2,
            (float)DockSurface.ActualSize.Y / 2,
            0);
        var opacity = visual.Compositor.CreateScalarKeyFrameAnimation();
        opacity.InsertKeyFrame(1, 0);
        opacity.Duration = TimeSpan.FromMilliseconds(140);
        var scale = visual.Compositor.CreateVector3KeyFrameAnimation();
        scale.InsertKeyFrame(1, new System.Numerics.Vector3(0.92f, 0.92f, 1));
        scale.Duration = opacity.Duration;
        visual.StartAnimation(nameof(visual.Opacity), opacity);
        visual.StartAnimation(nameof(visual.Scale), scale);
        await Task.Delay(opacity.Duration);
        AppWindow.Hide();
        visual.Opacity = 1;
        visual.Scale = System.Numerics.Vector3.One;
        _transitioning = false;
    }

    public void ShowFromNotch()
    {
        Position();
        AppWindow.Show();
        var visual = ElementCompositionPreview.GetElementVisual(DockSurface);
        visual.CenterPoint = new System.Numerics.Vector3(
            (float)DockSurface.ActualSize.X / 2,
            (float)DockSurface.ActualSize.Y / 2,
            0);
        visual.Opacity = 0;
        visual.Scale = new System.Numerics.Vector3(0.92f, 0.92f, 1);
        var opacity = visual.Compositor.CreateScalarKeyFrameAnimation();
        opacity.InsertKeyFrame(1, 1);
        opacity.Duration = TimeSpan.FromMilliseconds(180);
        var scale = visual.Compositor.CreateVector3KeyFrameAnimation();
        scale.InsertKeyFrame(1, System.Numerics.Vector3.One);
        scale.Duration = opacity.Duration;
        visual.StartAnimation(nameof(visual.Opacity), opacity);
        visual.StartAnimation(nameof(visual.Scale), scale);
    }

    private static void AnimateScale(UIElement element, float target)
    {
        var visual = ElementCompositionPreview.GetElementVisual(element);
        visual.CenterPoint = new System.Numerics.Vector3(
            (float)element.ActualSize.X / 2,
            (float)element.ActualSize.Y / 2,
            0);
        var animation = visual.Compositor.CreateVector3KeyFrameAnimation();
        animation.InsertKeyFrame(1, new System.Numerics.Vector3(target));
        animation.Duration = TimeSpan.FromMilliseconds(160);
        animation.StopBehavior = AnimationStopBehavior.SetToFinalValue;
        visual.StartAnimation(nameof(visual.Scale), animation);
    }

    private void Tile_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: PinnedItem item } button) return;
        if (item.Kind == "group")
        {
            ShowGroup(item, button);
            return;
        }
        if (item.Kind == "trash")
        {
            Process.Start(new ProcessStartInfo("explorer.exe", "shell:RecycleBinFolder") { UseShellExecute = true });
            return;
        }
        if (item.Kind is not ("widget" or "separator")) Launch(item);
    }

    private static void ShowGroup(PinnedItem group, FrameworkElement anchor)
    {
        var flyout = new MenuFlyout();
        foreach (var child in group.Children)
        {
            var menuItem = new MenuFlyoutItem { Text = child.Name, Tag = child };
            if (child.IconSource is not null) menuItem.Icon = new ImageIcon { Source = child.IconSource };
            menuItem.Click += (_, _) => Launch(child);
            flyout.Items.Add(menuItem);
        }
        flyout.ShowAt(anchor);
    }

    private void OpenItem_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem { Tag: PinnedItem item }) Launch(item);
    }

    private void OpenSettings_Click(object sender, RoutedEventArgs e) => App.OpenSettings();

    private void Quit_Click(object sender, RoutedEventArgs e) => App.Quit();

    private async void RemoveItem_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not MenuFlyoutItem { Tag: PinnedItem item }) return;
        App.Store.Value.Pinned.RemoveAll(entry => entry.Id == item.Id);
        await App.Store.SaveAsync();
        Refresh();
        Position();
    }

    private static void Launch(PinnedItem item)
    {
        if (string.IsNullOrWhiteSpace(item.Path)) return;
        Process.Start(new ProcessStartInfo(item.Path) { UseShellExecute = true });
    }
}
