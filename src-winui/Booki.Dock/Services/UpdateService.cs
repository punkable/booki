using System.Text.Json;
using Windows.ApplicationModel;

namespace Booki_Dock.Services;

public sealed record UpdateCheckResult(bool IsAvailable, Version Current, Version Latest, string Message);

public static class UpdateService
{
    private const string LatestReleaseApi = "https://api.github.com/repos/punkable/booki/releases/latest";
    public const string AppInstallerUri = "https://github.com/punkable/booki/releases/latest/download/BookiDock.appinstaller";

    public static async Task<UpdateCheckResult> CheckAsync(CancellationToken cancellationToken = default)
    {
        var package = Package.Current.Id.Version;
        var current = new Version(package.Major, package.Minor, package.Build);
        using var client = new HttpClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Booki-Dock-WinUI/0.51");
        using var response = await client.GetAsync(LatestReleaseApi, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var tag = json.RootElement.GetProperty("tag_name").GetString()?.TrimStart('v') ?? current.ToString();
        var latest = Version.TryParse(tag, out var parsed) ? parsed : current;
        var available = latest > current;
        return new UpdateCheckResult(
            available,
            current,
            latest,
            available ? $"Booki Dock {latest} está disponible." : "Tienes la versión más reciente.");
    }
}