using Microsoft.UI.Windowing;
using Booki_Dock.Services;
using Microsoft.UI.Xaml;
using Windows.Graphics;

namespace Booki_Dock;

public sealed partial class NotchWindow : Window
{
    public NotchWindow()
    {
        InitializeComponent();
        AppWindow.IsShownInSwitchers = false;
        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.SetBorderAndTitleBar(false, false);
            presenter.IsResizable = false;
            presenter.IsAlwaysOnTop = true;
        }
    }

    public void PositionNearDock()
    {
        var work = WindowStateService.GetWorkArea(App.Store.Value.MonitorIndex);
        var vertical = App.Store.Value.Edge is "Left" or "Right";
        var width = vertical ? 16 : 64;
        var height = vertical ? 64 : 16;
        var x = App.Store.Value.Edge switch
        {
            "Left" => work.X + 2,
            "Right" => work.X + work.Width - width - 2,
            _ => work.X + (work.Width - width) / 2
        };
        var y = App.Store.Value.Edge switch
        {
            "Top" => work.Y + 2,
            "Bottom" => work.Y + work.Height - height - 2,
            _ => work.Y + (work.Height - height) / 2
        };
        AppWindow.MoveAndResize(new RectInt32(x, y, width, height));
    }

    private void Reveal_Click(object sender, RoutedEventArgs e) => App.ShowDock();
    private void Reveal_PointerEntered(object sender, Microsoft.UI.Xaml.Input.PointerRoutedEventArgs e)
    {
        if (App.Store.Value.AutoHide && string.Equals(App.Store.Value.NotchTrigger, "Hover", StringComparison.OrdinalIgnoreCase)) App.ShowDock();
    }
}
