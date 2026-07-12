using System.ComponentModel;
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
    public int IconSize { get; set; } = 48;
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
        "group" => "▦",
        "widget" => Widget switch { "clock" => "◷", "cpu" => "%", "note" => "N", _ => "W" },
        _ => string.IsNullOrWhiteSpace(Name) ? "?" : Name[..1].ToUpperInvariant()
    };
    public ImageSource? IconSource { get; private set; }
    public double RunningOpacity { get; private set; }

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
}
