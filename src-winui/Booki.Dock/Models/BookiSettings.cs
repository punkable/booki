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

public sealed class PinnedItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    public string Kind { get; set; } = "app";
    public string Initial => string.IsNullOrWhiteSpace(Name) ? "?" : Name[..1].ToUpperInvariant();
}
