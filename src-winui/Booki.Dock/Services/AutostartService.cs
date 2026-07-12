using Microsoft.Win32;
using Windows.ApplicationModel;

namespace Booki_Dock.Services;

public static class AutostartService
{
    private const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "BookiDock";

    public static async Task<bool> SetAsync(bool enabled)
    {
        try
        {
            var task = await StartupTask.GetAsync("BookiDockStartup");
            if (!enabled)
            {
                task.Disable();
                return true;
            }
            if (task.State == StartupTaskState.Enabled) return true;
            return await task.RequestEnableAsync() == StartupTaskState.Enabled;
        }
        catch
        {
            return SetUnpackaged(enabled);
        }
    }

    private static bool SetUnpackaged(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
        if (!enabled)
        {
            key.DeleteValue(ValueName, false);
            return true;
        }
        if (Environment.ProcessPath is not { Length: > 0 } path) return false;
        key.SetValue(ValueName, $"\"{path}\"");
        return true;
    }
}
