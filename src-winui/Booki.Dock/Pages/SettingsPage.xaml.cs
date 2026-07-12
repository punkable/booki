using Booki_Dock.Models;
using Booki_Dock.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using Windows.ApplicationModel.DataTransfer;
using Windows.ApplicationModel;
using Windows.System;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace Booki_Dock.Pages;

public sealed partial class SettingsPage : Page
{
    private bool _loading = true;

    public SettingsPage()
    {
        InitializeComponent();
        Loaded += SettingsPage_Loaded;
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var section = e.Parameter as string ?? "general";
        GeneralPanel.Visibility = section == "general" ? Visibility.Visible : Visibility.Collapsed;
        AppearancePanel.Visibility = section == "appearance" ? Visibility.Visible : Visibility.Collapsed;
        BehaviorPanel.Visibility = section == "behavior" ? Visibility.Visible : Visibility.Collapsed;
        PinnedPanel.Visibility = section == "pinned" ? Visibility.Visible : Visibility.Collapsed;
        UpdatesPanel.Visibility = section == "updates" ? Visibility.Visible : Visibility.Collapsed;
        AboutPanel.Visibility = section == "about" ? Visibility.Visible : Visibility.Collapsed;
    }

    private void SettingsPage_Loaded(object sender, RoutedEventArgs e)
    {
        var value = App.Store.Value;
        SelectByTag(ThemeBox, value.Theme);
        SelectByTag(EdgeBox, value.Edge);
        PopulateMonitors(value.MonitorIndex);
        IconSizeSlider.Value = value.IconSize;
        SpacingSlider.Value = value.Spacing;
        RadiusSlider.Value = value.CornerRadius;
        HideDelaySlider.Value = value.AutoHideDelay;
        SelectByTag(NotchTriggerBox, value.NotchTrigger);
        AlwaysOnTop.IsOn = value.AlwaysOnTop;
        AutoHide.IsOn = value.AutoHide;
        Magnification.IsOn = value.Magnification;
        ShowLabels.IsOn = value.ShowLabels;
        ShowIndicators.IsOn = value.ShowIndicators;
        StartWithWindows.IsOn = value.AutoStart;
        ContextMenu.IsOn = value.ContextMenu;
        AccentPicker.Color = ColorHelper.ToColor(value.Accent);
        PinnedAppsList.ItemsSource = value.Pinned;
        MigrationInfo.IsOpen = File.Exists(App.Store.LegacyPath);
        var packageVersion = Package.Current.Id.Version;
        var displayVersion = $"{packageVersion.Major}.{packageVersion.Minor}.{packageVersion.Build}";
        VersionText.Text = $"Versión {displayVersion} · WinUI 3 · Windows App SDK 2.2";
        UpdateVersionText.Text = $"Versión instalada: {displayVersion}";
        _loading = false;
    }

    private async void Setting_Changed(object sender, object e)
    {
        if (_loading) return;
        App.Store.Value.Theme = (ThemeBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "System";
        App.Store.Value.Edge = (EdgeBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "Bottom";
        App.Store.Value.MonitorIndex = int.TryParse((MonitorBox.SelectedItem as ComboBoxItem)?.Tag?.ToString(), out var monitor) ? monitor : -1;
        App.Store.Value.IconSize = (int)IconSizeSlider.Value;
        App.Store.Value.Spacing = (int)SpacingSlider.Value;
        App.Store.Value.CornerRadius = (int)RadiusSlider.Value;
        App.Store.Value.AutoHideDelay = (int)HideDelaySlider.Value;
        App.Store.Value.NotchTrigger = (NotchTriggerBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "Click";
        App.Store.Value.AlwaysOnTop = AlwaysOnTop.IsOn;
        App.Store.Value.AutoHide = AutoHide.IsOn;
        App.Store.Value.Magnification = Magnification.IsOn;
        App.Store.Value.ShowLabels = ShowLabels.IsOn;
        App.Store.Value.ShowIndicators = ShowIndicators.IsOn;
        App.Store.Value.ContextMenu = ContextMenu.IsOn;
        await App.Store.SaveAsync();
        ContextMenuService.Sync(App.Store.Value.ContextMenu);
        App.SetDockAlwaysOnTop(App.Store.Value.AlwaysOnTop);
        App.RefreshDock();
    }

    private async void AccentPicker_ColorChanged(ColorPicker sender, ColorChangedEventArgs args)
    {
        if (_loading) return;
        App.Store.Value.Accent = $"#{args.NewColor.R:X2}{args.NewColor.G:X2}{args.NewColor.B:X2}";
        await App.Store.SaveAsync();
        App.ApplyAccent(App.Store.Value.Accent);
    }

    private async void ImportLegacy_Click(object sender, RoutedEventArgs e)
    {
        await App.Store.ImportLegacyAsync();
        MigrationInfo.Severity = InfoBarSeverity.Success;
        MigrationInfo.Title = "Configuración importada";
        MigrationInfo.Message = "Booki Legacy no fue modificado.";
        PinnedAppsList.ItemsSource = null;
        PinnedAppsList.ItemsSource = App.Store.Value.Pinned;
        App.RefreshDock();
    }

    private async void AddApp_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileOpenPicker();
        picker.FileTypeFilter.Add(".exe");
        picker.FileTypeFilter.Add(".lnk");
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(App.SettingsWindow!));
        var file = await picker.PickSingleFileAsync();
        if (file is null) return;
        App.Store.Value.Pinned.Add(new PinnedItem { Name = Path.GetFileNameWithoutExtension(file.Name), Path = file.Path });
        await App.Store.SaveAsync();
        PinnedAppsList.ItemsSource = null;
        PinnedAppsList.ItemsSource = App.Store.Value.Pinned;
        App.RefreshDock();
    }

    private async void AddFolder_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FolderPicker();
        picker.FileTypeFilter.Add("*");
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(App.SettingsWindow!));
        var folder = await picker.PickSingleFolderAsync();
        if (folder is null) return;
        App.Store.Value.Pinned.Add(new PinnedItem { Name = folder.Name, Path = folder.Path, Kind = "folder" });
        await RefreshPinnedAsync();
    }

    private async void AddWebsite_Click(object sender, RoutedEventArgs e)
    {
        var nameBox = new TextBox { Header = "Nombre", PlaceholderText = "Mi sitio" };
        var urlBox = new TextBox { Header = "Dirección", PlaceholderText = "https://example.com" };
        var content = new StackPanel { Spacing = 12 };
        content.Children.Add(nameBox);
        content.Children.Add(urlBox);
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = "Añadir sitio web",
            Content = content,
            PrimaryButtonText = "Añadir",
            CloseButtonText = "Cancelar",
            DefaultButton = ContentDialogButton.Primary
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
        var raw = urlBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(raw)) return;
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri))
        {
            raw = $"https://{raw}";
            if (!Uri.TryCreate(raw, UriKind.Absolute, out uri)) return;
        }
        var name = string.IsNullOrWhiteSpace(nameBox.Text) ? uri.Host : nameBox.Text.Trim();
        App.Store.Value.Pinned.Add(new PinnedItem { Name = name, Path = uri.AbsoluteUri, Kind = "web" });
        await RefreshPinnedAsync();
    }

    private async void MoveToGroup_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: PinnedItem item } || item.Kind == "group") return;
        var groups = App.Store.Value.Pinned.Where(entry => entry.Kind == "group" && entry.Id != item.Id).ToList();
        if (groups.Count == 0)
        {
            var notice = new ContentDialog
            {
                XamlRoot = XamlRoot,
                Title = "Primero crea un grupo",
                Content = "Añade un grupo y después podrás mover aplicaciones, carpetas y widgets dentro de él.",
                CloseButtonText = "Entendido"
            };
            await notice.ShowAsync();
            return;
        }
        var groupBox = new ComboBox { Header = "Grupo", ItemsSource = groups, DisplayMemberPath = nameof(PinnedItem.Name), SelectedIndex = 0 };
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"Mover {item.Name}",
            Content = groupBox,
            PrimaryButtonText = "Mover",
            CloseButtonText = "Cancelar",
            DefaultButton = ContentDialogButton.Primary
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || groupBox.SelectedItem is not PinnedItem group) return;
        App.Store.Value.Pinned.RemoveAll(entry => entry.Id == item.Id);
        group.Children.Add(item);
        await RefreshPinnedAsync();
    }
    private async void RemovePinned_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: PinnedItem item }) return;
        App.Store.Value.Pinned.RemoveAll(entry => entry.Id == item.Id);
        await App.Store.SaveAsync();
        PinnedAppsList.ItemsSource = null;
        PinnedAppsList.ItemsSource = App.Store.Value.Pinned;
        App.RefreshDock();
    }

    private async void AddGroup_Click(object sender, RoutedEventArgs e)
    {
        App.Store.Value.Pinned.Add(new PinnedItem { Name = "Nuevo grupo", Kind = "group" });
        await RefreshPinnedAsync();
    }

    private async void AddWidget_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not MenuFlyoutItem { Tag: string widget }) return;
        var name = widget switch { "clock" => "Reloj", "cpu" => "CPU", "note" => "Notas", _ => "Portapapeles" };
        App.Store.Value.Pinned.Add(new PinnedItem { Name = name, Kind = "widget", Widget = widget });
        await RefreshPinnedAsync();
    }

    private async void AddSeparator_Click(object sender, RoutedEventArgs e)
    {
        App.Store.Value.Pinned.Add(new PinnedItem { Name = "Separador", Kind = "separator" });
        await RefreshPinnedAsync();
    }

    private async void AddTrash_Click(object sender, RoutedEventArgs e)
    {
        if (App.Store.Value.Pinned.Any(item => item.Kind == "trash")) return;
        App.Store.Value.Pinned.Add(new PinnedItem { Name = "Papelera", Kind = "trash" });
        await RefreshPinnedAsync();
    }
    private async void StartWithWindows_Toggled(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        App.Store.Value.AutoStart = await AutostartService.SetAsync(StartWithWindows.IsOn);
        if (StartWithWindows.IsOn != App.Store.Value.AutoStart)
        {
            _loading = true;
            StartWithWindows.IsOn = App.Store.Value.AutoStart;
            _loading = false;
            StartupInfo.Severity = InfoBarSeverity.Warning;
            StartupInfo.Title = "Windows no permitió activar el inicio automático";
            StartupInfo.Message = "Puedes habilitar Booki Dock desde Configuración > Aplicaciones > Inicio.";
            StartupInfo.IsOpen = true;
        }
        else
        {
            StartupInfo.Severity = InfoBarSeverity.Success;
            StartupInfo.Title = StartWithWindows.IsOn ? "Booki Dock se iniciará con Windows" : "Inicio automático desactivado";
            StartupInfo.Message = "El cambio se guardó correctamente.";
            StartupInfo.IsOpen = true;
        }
        await App.Store.SaveAsync();
    }

    private async void PinnedAppsList_DragItemsCompleted(ListViewBase sender, DragItemsCompletedEventArgs args)
    {
        if (args.DropResult == DataPackageOperation.None) return;
        App.Store.Value.Pinned = PinnedAppsList.Items.OfType<PinnedItem>().ToList();
        await App.Store.SaveAsync();
        App.RefreshDock();
    }

    private async Task RefreshPinnedAsync()
    {
        await App.Store.SaveAsync();
        PinnedAppsList.ItemsSource = null;
        PinnedAppsList.ItemsSource = App.Store.Value.Pinned;
        App.RefreshDock();
    }

    private async void CheckUpdates_Click(object sender, RoutedEventArgs e)
    {
        CheckUpdatesButton.IsEnabled = false;
        CheckUpdatesButton.Content = "Buscando...";
        UpdateInfo.IsOpen = false;
        try
        {
            var result = await UpdateService.CheckAsync();
            UpdateInfo.Severity = result.IsAvailable ? InfoBarSeverity.Success : InfoBarSeverity.Informational;
            UpdateInfo.Title = result.IsAvailable ? "Actualización disponible" : "Booki Dock está actualizado";
            UpdateInfo.Message = result.Message;
            UpdateInfo.IsOpen = true;
            if (result.IsAvailable)
            {
                CheckUpdatesButton.Content = "Descargando...";
                var installer = await UpdateService.DownloadInstallerAsync(result.InstallerUri!);
                UpdateService.LaunchInstaller(installer);
                Application.Current.Exit();
            }
        }
        catch (Exception ex)
        {
            UpdateInfo.Severity = InfoBarSeverity.Error;
            UpdateInfo.Title = "No se pudo buscar actualizaciones";
            UpdateInfo.Message = ex.Message;
            UpdateInfo.IsOpen = true;
        }
        finally
        {
            CheckUpdatesButton.Content = "Buscar actualizaciones";
            CheckUpdatesButton.IsEnabled = true;
        }
    }

    private void PopulateMonitors(int selected)
    {
        MonitorBox.Items.Clear();
        MonitorBox.Items.Add(new ComboBoxItem { Content = "Automática (principal)", Tag = "-1" });
        foreach (var monitor in WindowStateService.GetMonitors())
        {
            var suffix = monitor.IsPrimary ? " · Principal" : "";
            MonitorBox.Items.Add(new ComboBoxItem
            {
                Content = $"Pantalla {monitor.Index + 1}{suffix}",
                Tag = monitor.Index.ToString()
            });
        }
        SelectByTag(MonitorBox, selected.ToString());
    }
    private static void SelectByTag(ComboBox combo, string value)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
        {
            if (string.Equals(item.Tag?.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                combo.SelectedItem = item;
                return;
            }
        }
        combo.SelectedIndex = 0;
    }
}
