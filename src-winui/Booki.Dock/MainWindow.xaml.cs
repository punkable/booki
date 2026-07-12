using Booki_Dock.Pages;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Booki_Dock;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
        AppWindow.SetIcon("Assets/AppIcon.ico");
        AppWindow.Resize(new Windows.Graphics.SizeInt32(780, 620));
        NavFrame.Navigate(typeof(SettingsPage), "general");
    }

    public void NavigateTo(string section)
    {
        var item = NavView.MenuItems.OfType<NavigationViewItem>()
            .FirstOrDefault(entry => string.Equals(entry.Tag?.ToString(), section, StringComparison.OrdinalIgnoreCase));
        if (item is not null) NavView.SelectedItem = item;
        NavFrame.Navigate(typeof(SettingsPage), section);
    }

    private void TitleBar_PaneToggleRequested(TitleBar sender, object args) =>
        NavView.IsPaneOpen = !NavView.IsPaneOpen;

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item)
        {
            NavFrame.Navigate(typeof(SettingsPage), item.Tag?.ToString() ?? "general");
        }
    }
}
