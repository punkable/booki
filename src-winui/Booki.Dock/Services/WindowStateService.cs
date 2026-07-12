using System.Runtime.InteropServices;
using Windows.Graphics;

namespace Booki_Dock.Services;

public sealed record MonitorDescriptor(int Index, string Name, RectInt32 WorkArea, bool IsPrimary);

public static class WindowStateService
{
    private const uint MonitorDefaultToNearest = 2;
    private const uint MonitorPrimary = 1;
    private delegate bool MonitorEnumProc(IntPtr monitor, IntPtr hdc, IntPtr rect, IntPtr data);

    public static IReadOnlyList<MonitorDescriptor> GetMonitors()
    {
        var result = new List<MonitorDescriptor>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (monitor, _, _, _) =>
        {
            var info = new MonitorInfoEx { Size = Marshal.SizeOf<MonitorInfoEx>() };
            if (!GetMonitorInfoEx(monitor, ref info)) return true;
            var work = info.Work;
            result.Add(new MonitorDescriptor(
                result.Count,
                string.IsNullOrWhiteSpace(info.Device) ? $"Pantalla {result.Count + 1}" : info.Device,
                new RectInt32(work.Left, work.Top, work.Right - work.Left, work.Bottom - work.Top),
                (info.Flags & MonitorPrimary) != 0));
            return true;
        }, IntPtr.Zero);
        return result.OrderByDescending(item => item.IsPrimary).ThenBy(item => item.Index).Select((item, index) => item with { Index = index }).ToList();
    }

    public static RectInt32 GetWorkArea(int monitorIndex)
    {
        var monitors = GetMonitors();
        if (monitors.Count == 0) return new RectInt32(0, 0, 1280, 720);
        if (monitorIndex < 0 || monitorIndex >= monitors.Count)
            return monitors.FirstOrDefault(item => item.IsPrimary)?.WorkArea ?? monitors[0].WorkArea;
        return monitors[monitorIndex].WorkArea;
    }

    public static bool IsForegroundFullscreen()
    {
        var window = GetForegroundWindow();
        if (window == IntPtr.Zero || !GetWindowRect(window, out var rect)) return false;
        var monitor = MonitorFromWindow(window, MonitorDefaultToNearest);
        var info = new MonitorInfoEx { Size = Marshal.SizeOf<MonitorInfoEx>() };
        if (monitor == IntPtr.Zero || !GetMonitorInfoEx(monitor, ref info)) return false;
        var width = rect.Right - rect.Left;
        var height = rect.Bottom - rect.Top;
        var monitorWidth = info.Monitor.Right - info.Monitor.Left;
        var monitorHeight = info.Monitor.Bottom - info.Monitor.Top;
        return width >= monitorWidth && height >= monitorHeight &&
               rect.Left <= info.Monitor.Left && rect.Top <= info.Monitor.Top;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc callback, IntPtr data);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr window, out NativeRect rect);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);

    [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfoEx(IntPtr monitor, ref MonitorInfoEx info);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MonitorInfoEx
    {
        public int Size;
        public NativeRect Monitor;
        public NativeRect Work;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device;
    }
}