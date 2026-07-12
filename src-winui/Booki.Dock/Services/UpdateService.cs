using System.Diagnostics;
using System.Reflection;
using System.Text.Json;

namespace Booki_Dock.Services;

public sealed record UpdateCheckResult(bool IsAvailable, Version Current, Version Latest, string Message, string? InstallerUri);

public static class UpdateService
{
    private const string ReleasesApi = "https://api.github.com/repos/punkable/booki/releases?per_page=30";
    private const string WinUiTagPrefix = "winui-v";

    public static async Task<UpdateCheckResult> CheckAsync(CancellationToken cancellationToken = default)
    {
        var current = Assembly.GetEntryAssembly()?.GetName().Version ?? new Version(0, 51, 0);
        using var client = CreateClient();
        using var response = await client.GetAsync(ReleasesApi, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        var releases = json.RootElement.EnumerateArray()
            .Where(item => !item.GetProperty("draft").GetBoolean())
            .Select(item => ReadRelease(item))
            .Where(item => item is not null)
            .Cast<WinUiRelease>()
            .OrderByDescending(item => item.Version)
            .ToList();

        var latestRelease = releases.FirstOrDefault();
        if (latestRelease is null)
            return new UpdateCheckResult(false, current, current, "No WinUI preview release is available yet.", null);

        var available = latestRelease.Version > current;
        return new UpdateCheckResult(
            available,
            current,
            latestRelease.Version,
            available ? $"Booki Dock {latestRelease.Version} is available." : "You have the latest WinUI preview.",
            available ? latestRelease.InstallerUri : null);
    }

    public static async Task<string> DownloadInstallerAsync(string installerUri, CancellationToken cancellationToken = default)
    {
        var target = Path.Combine(Path.GetTempPath(), "Booki-Dock-WinUI3-Setup.exe");
        using var client = CreateClient();
        using var response = await client.GetAsync(installerUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
        await using (var destination = File.Create(target))
            await source.CopyToAsync(destination, cancellationToken);

        await using var file = File.OpenRead(target);
        if (file.Length < 64 || file.ReadByte() != 'M' || file.ReadByte() != 'Z')
            throw new InvalidDataException("The downloaded installer is not a valid Windows executable.");
        return target;
    }

    public static void LaunchInstaller(string path) => Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });

    private static WinUiRelease? ReadRelease(JsonElement release)
    {
        var tag = release.GetProperty("tag_name").GetString() ?? "";
        if (!tag.StartsWith(WinUiTagPrefix, StringComparison.OrdinalIgnoreCase) ||
            !Version.TryParse(tag[WinUiTagPrefix.Length..], out var version)) return null;

        string? installerUri = null;
        foreach (var asset in release.GetProperty("assets").EnumerateArray())
        {
            if (!string.Equals(asset.GetProperty("name").GetString(), "Booki-Dock-WinUI3-Setup.exe", StringComparison.OrdinalIgnoreCase)) continue;
            installerUri = asset.GetProperty("browser_download_url").GetString();
            break;
        }
        return string.IsNullOrWhiteSpace(installerUri) ? null : new WinUiRelease(version, installerUri);
    }

    private static HttpClient CreateClient()
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Booki-Dock-WinUI/0.51");
        return client;
    }

    private sealed record WinUiRelease(Version Version, string InstallerUri);
}
