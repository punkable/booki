using Microsoft.Win32;

namespace Booki_Dock.Services;

public static class ContextMenuService
{
    private const string FileKey = @"Software\Classes\*\shell\BookiDock.Pin";
    private const string FolderKey = @"Software\Classes\Directory\shell\BookiDock.Pin";

    public static void Sync(bool enabled)
    {
        if (!enabled)
        {
            Registry.CurrentUser.DeleteSubKeyTree(FileKey, false);
            Registry.CurrentUser.DeleteSubKeyTree(FolderKey, false);
            return;
        }

        if (Environment.ProcessPath is not { Length: > 0 } path) return;
        Write(FileKey, path);
        Write(FolderKey, path);
    }

    private static void Write(string keyPath, string executable)
    {
        using var shell = Registry.CurrentUser.CreateSubKey(keyPath);
        shell.SetValue(null, "Añadir a Booki Dock");
        shell.SetValue("Icon", executable);
        using var command = shell.CreateSubKey("command");
        command.SetValue(null, $"\"{executable}\" --pin \"%1\"");
    }
}
