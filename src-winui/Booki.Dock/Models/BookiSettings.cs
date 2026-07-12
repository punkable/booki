using System.ComponentModel;
using System.Text.Json.Serialization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;

namespace Booki_Dock.Models;

public sealed class BookiSettings
{
    public string Theme { get; set; } = "System";
    public string Accent { get; set; } = "#DFAA75";
    public string Edge { get; set; } = "Bottom";
    public bool AlwaysOnTop { get; set; } = true;
    public bool AutoHide { get; set; }
    public bool Magnification { get; set; } = true;
    public int IconSize { get; set; } = 40;
    public int Spacing { get; set; } = 4;
    public int CornerRadius { get; set; } = 12;
    public int MaterialStrength { get; set; } = 70;
    public int AutoHideDelay { get; set; } = 650;
    public int MonitorIndex { get; set; } = -1;
    public string NotchTrigger { get; set; } = "Click";
    public bool ShowLabels { get; set; } = true;
    public bool ShowIndicators { get; set; } = true;
    public bool FocusIfRunning { get; set; } = true;
    public bool AutoStart { get; set; }
    public bool ContextMenu { get; set; } = true;
    public List<PinnedItem> Pinned { get; set; } = [];
}

public sealed class PinnedItem : INotifyPropertyChanged
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    public string Kind { get; set; } = "app";
    public string Widget { get; set; } = "";
    public List<PinnedItem> Children { get; set; } = [];
    public string Initial => Kind switch
    {
        "group" => "\uE902",
        "separator" => "\uE94A",
        "trash" => "\uE74D",
        "widget" => Widget switch { "clock" => "\uE121", "cpu" => "%", "note" => "\uE70B", _ => "\uE9F9" },
        _ => string.IsNullOrWhiteSpace(Name) ? "?" : Name[..1].ToUpperInvariant()
    };
    public FontFamily InitialFontFamily => Kind is "group" or "widget"
        ? new FontFamily("Segoe Fluent Icons")
        : new FontFamily("Segoe UI Variable Text");
    public ImageSource? IconSource { get; private set; }
    public double RunningOpacity { get; private set; }
    public string WidgetDisplay { get; private set; } = "";
    public double WidgetOpacity => Kind == "widget" ? 1 : 0;
    public double IconOpacity => Kind == "widget" ? 0 : 1;
    [JsonIgnore] public double TileSize { get; private set; } = 48;
    [JsonIgnore] public double ImageSize { get; private set; } = 40;
    [JsonIgnore] public double InitialFontSize { get; private set; } = 16;
    [JsonIgnore] public Thickness TileMargin { get; private set; } = new(1);

    public event PropertyChangedEventHandler? PropertyChanged;

    public void SetIcon(ImageSource? source)
    {
        IconSource = source;
        PropertyChanged?.Invoke(this, new(nameof(IconSource)));
    }

    public void SetRunning(bool running)
    {
        RunningOpacity = running ? 1 : 0;
        PropertyChanged?.Invoke(this, new(nameof(RunningOpacity)));
    }

    public void SetWidgetDisplay(string value)
    {
        WidgetDisplay = value;
        PropertyChanged?.Invoke(this, new(nameof(WidgetDisplay)));
    }

    public void SetLayout(int size, int spacing)
    {
        TileSize = size + 8;
        ImageSize = size;
        InitialFontSize = Math.Max(14, size * 0.38);
        TileMargin = new Thickness(Math.Clamp(spacing, 0, 12) / 2d);
        PropertyChanged?.Invoke(this, new(nameof(TileSize)));
        PropertyChanged?.Invoke(this, new(nameof(ImageSize)));
        PropertyChanged?.Invoke(this, new(nameof(InitialFontSize)));
        PropertyChanged?.Invoke(this, new(nameof(TileMargin)));
    }
}
