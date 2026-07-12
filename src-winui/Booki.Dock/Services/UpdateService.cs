using System.Diagnostics;
using System.Reflection;
using System.Text.Json;

namespace Booki_Dock.Services;

public sealed record UpdateCheckResult(bool IsAvailable, Version Current, Version Latest, string Message);

public static class UpdateService
{
    private const string LatestReleaseApi = "https://api.github.com/repos/punkable/booki/releases/latest";
    public const string SetupUri = "https://github.com/punkable/booki/releases/latest/download/Booki-Dock-WinUI3-Setup.exe";
    public const string AppInstallerUri = "https://github.com/punkable/booki/releases/latest/download/BookiDock.appinstaller";

    public static async Task<UpdateCheckResult> CheckAsync(CancellationToken cancellationToken = default)
    {
        var current = Assembly.GetEntryAssembly()?.GetName().Version ?? new Version(0, 51, 0);
        using var client = CreateClient();
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

    public static async Task<string> DownloadInstallerAsync(CancellationToken cancellationToken = default)
    {
        var target = Path.Combine(Path.GetTempPath(), "Booki-Dock-WinUI3-Setup.exe");
        using var client = CreateClient();
        using var response = await client.GetAsync(SetupUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
        await using (var destination = File.Create(target))
            await source.CopyToAsync(destination, cancellationToken);

        await using var file = File.OpenRead(target);
        if (file.Length < 64 || file.ReadByte() != 'M' || file.ReadByte() != 'Z')
            throw new InvalidDataException("El instalador descargado no es un ejecutable válido.");
        return target;
    }

    public static void LaunchInstaller(string path) => Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });

    private static HttpClient CreateClient()
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Booki-Dock-WinUI/0.51");
        return client;
    }
}
