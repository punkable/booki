using System.Diagnostics;
using Booki_Dock.Models;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Graphics;

namespace Booki_Dock;

public sealed partial class DockWindow : Window
{
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
    }

    public void Refresh()
    {
        PinnedList.ItemsSource = null;
        PinnedList.ItemsSource = App.Store.Value.Pinned;
    }

    private void Position()
    {
        var display = DisplayArea.Primary;
        var width = Math.Clamp(80 + App.Store.Value.Pinned.Count * 56, 192, 768);
        const int height = 76;
        var work = display.WorkArea;
        var x = work.X + (work.Width - width) / 2;
        var y = work.Y + work.Height - height - 12;
        AppWindow.MoveAndResize(new RectInt32(x, y, width, height));
    }

    private void PinnedList_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is PinnedItem item) Launch(item);
    }

    private void Settings_Click(object sender, RoutedEventArgs e) => App.ShowSettings();

    private void OpenItem_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem { Tag: PinnedItem item }) Launch(item);
    }

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
