using Microsoft.Win32;

namespace Booki_Dock.Services;

public static class AutostartService
{
    private const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "BookiDock";

    public static void Set(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
        if (!enabled)
        {
            key.DeleteValue(ValueName, false);
            return;
        }

        if (Environment.ProcessPath is { Length: > 0 } path)
            key.SetValue(ValueName, $"\"{path}\"");
    }
}
