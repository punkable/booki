using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.FileProperties;

namespace Booki_Dock.Services;

public static class AppIconService
{
    public static async Task<BitmapImage?> LoadAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.StartsWith("ms-", StringComparison.OrdinalIgnoreCase))
            return null;
        try
        {
            var file = await StorageFile.GetFileFromPathAsync(path);
            using var thumbnail = await file.GetThumbnailAsync(ThumbnailMode.SingleItem, 64, ThumbnailOptions.UseCurrentScale);
            if (thumbnail is null) return null;
            var image = new BitmapImage();
            await image.SetSourceAsync(thumbnail);
            return image;
        }
        catch
        {
            return null;
        }
    }
}
