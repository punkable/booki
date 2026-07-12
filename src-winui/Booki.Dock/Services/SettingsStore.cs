using System.Text.Json;
using Booki_Dock.Models;

namespace Booki_Dock.Services;

public sealed class SettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    private readonly string _directory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Booki", "Dock");

    public BookiSettings Value { get; private set; } = new();
    public string FilePath => Path.Combine(_directory, "settings.json");
    public string LegacyPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Booki", "config.json");

    public async Task LoadAsync()
    {
        Directory.CreateDirectory(_directory);
        if (File.Exists(FilePath))
        {
            Value = JsonSerializer.Deserialize<BookiSettings>(
                await File.ReadAllTextAsync(FilePath), JsonOptions) ?? new();
            return;
        }

        Value = new BookiSettings();
        if (File.Exists(LegacyPath))
        {
            await ImportLegacyAsync();
        }
        else
        {
            Value.Pinned =
            [
                new() { Name = "Explorador", Path = "explorer.exe" },
                new() { Name = "Configuración", Path = "ms-settings:" }
            ];
            await SaveAsync();
        }
    }

    public async Task ImportLegacyAsync()
    {
        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(LegacyPath));
        var root = document.RootElement;
        Value.Theme = ReadString(root, "theme", Value.Theme);
        Value.Accent = ReadString(root, "accent", Value.Accent);
        Value.Edge = ReadString(root, "edge", Value.Edge);
        Value.AlwaysOnTop = ReadBool(root, "alwaysOnTop", Value.AlwaysOnTop);
        Value.AutoHide = ReadBool(root, "autoHide", Value.AutoHide);
        Value.Magnification = ReadBool(root, "magnification", Value.Magnification);
        Value.IconSize = ReadInt(root, "iconSize", Value.IconSize);
        Value.Spacing = ReadInt(root, "spacing", Value.Spacing);
        Value.CornerRadius = ReadInt(root, "cornerRadius", Value.CornerRadius);
        Value.MaterialStrength = ReadInt(root, "materialStrength", Value.MaterialStrength);
        Value.AutoHideDelay = ReadInt(root, "autoHideDelay", Value.AutoHideDelay);
        Value.MonitorIndex = ReadInt(root, "monitor", Value.MonitorIndex);
        Value.NotchTrigger = ReadString(root, "notchTrigger", Value.NotchTrigger);
        Value.ShowLabels = ReadBool(root, "showLabels", Value.ShowLabels);
        Value.ShowIndicators = ReadBool(root, "showIndicators", Value.ShowIndicators);
        Value.FocusIfRunning = ReadBool(root, "focusIfRunning", Value.FocusIfRunning);
        Value.AutoStart = ReadBool(root, "autostart", Value.AutoStart);
        Value.ContextMenu = ReadBool(root, "contextMenu", Value.ContextMenu);
        Value.Pinned.Clear();
        if (root.TryGetProperty("pinned", out var pinned) && pinned.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in pinned.EnumerateArray())
            {
                var parsed = ParsePinned(item);
                if (parsed is not null) Value.Pinned.Add(parsed);
            }
        }
        await SaveAsync();
    }

    public async Task SaveAsync()
    {
        Directory.CreateDirectory(_directory);
        await File.WriteAllTextAsync(FilePath, JsonSerializer.Serialize(Value, JsonOptions));
    }

    private static string ReadString(JsonElement root, string name, string fallback) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? fallback : fallback;
    private static bool ReadBool(JsonElement root, string name, bool fallback) =>
        root.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean() : fallback;
    private static int ReadInt(JsonElement root, string name, int fallback) =>
        root.TryGetProperty(name, out var value) && value.TryGetInt32(out var result) ? result : fallback;

    private static PinnedItem? ParsePinned(JsonElement item)
    {
        var kind = ReadString(item, "kind", "app");
        if (kind == "separator") return null;
        var parsed = new PinnedItem
        {
            Id = ReadString(item, "id", Guid.NewGuid().ToString("N")),
            Name = ReadString(item, "name", kind == "widget" ? "Widget" : "App"),
            Path = ReadString(item, "path", ""),
            Kind = kind,
            Widget = ReadString(item, "widget", "")
        };
        if (item.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in children.EnumerateArray())
            {
                var parsedChild = ParsePinned(child);
                if (parsedChild is not null) parsed.Children.Add(parsedChild);
            }
        }
        return parsed;
    }
}
