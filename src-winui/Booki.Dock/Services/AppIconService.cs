using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.FileProperties;

namespace Booki_Dock.Services;

public static class AppIconService
{
    private static readonly Dictionary<string, (DateTime Stamp, BitmapImage Image)> Cache =
        new(StringComparer.OrdinalIgnoreCase);

    public static async Task<BitmapImage?> LoadAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.StartsWith("ms-", StringComparison.OrdinalIgnoreCase))
            return null;

        try
        {
            var stamp = File.Exists(path) ? File.GetLastWriteTimeUtc(path) : DateTime.MinValue;
            if (Cache.TryGetValue(path, out var cached) && cached.Stamp == stamp) return cached.Image;

            var file = await StorageFile.GetFileFromPathAsync(path);
            var thumbnail = await file.GetThumbnailAsync(
                ThumbnailMode.ListView,
                128,
                ThumbnailOptions.UseCurrentScale | ThumbnailOptions.ResizeThumbnail);
            if (thumbnail is null || thumbnail.Size == 0)
            {
                thumbnail?.Dispose();
                thumbnail = await file.GetThumbnailAsync(
                    ThumbnailMode.SingleItem,
                    128,
                    ThumbnailOptions.UseCurrentScale | ThumbnailOptions.ResizeThumbnail);
            }
            if (thumbnail is null || thumbnail.Size == 0) return null;

            using (thumbnail)
            {
                var image = new BitmapImage { DecodePixelWidth = 128, DecodePixelType = DecodePixelType.Physical };
                await image.SetSourceAsync(thumbnail);
                Cache[path] = (stamp, image);
                return image;
            }
        }
        catch
        {
            Cache.Remove(path);
            return null;
        }
    }

    public static void Invalidate(string path) => Cache.Remove(path);
}