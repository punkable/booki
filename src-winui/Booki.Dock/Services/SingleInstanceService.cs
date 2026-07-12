using System.IO.Pipes;
using System.Text.Json;

namespace Booki_Dock.Services;

public sealed class SingleInstanceService : IDisposable
{
    private const string MutexName = "BookiDock.SingleInstance";
    private const string PipeName = "BookiDock.Arguments";
    private Mutex? _mutex;
    private CancellationTokenSource? _cts;

    public bool Acquire()
    {
        _mutex = new Mutex(true, MutexName, out var created);
        return created;
    }

    public void Listen(Action<string[]> receive)
    {
        _cts = new CancellationTokenSource();
        _ = Task.Run(async () =>
        {
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    await using var pipe = new NamedPipeServerStream(PipeName, PipeDirection.In, 1,
                        PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                    await pipe.WaitForConnectionAsync(_cts.Token);
                    var args = await JsonSerializer.DeserializeAsync<string[]>(pipe, cancellationToken: _cts.Token);
                    if (args is not null) receive(args);
                }
                catch (OperationCanceledException) { break; }
                catch { }
            }
        });
    }

    public static async Task SendAsync(string[] args)
    {
        try
        {
            await using var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.Out, PipeOptions.Asynchronous);
            await pipe.ConnectAsync(2000);
            await JsonSerializer.SerializeAsync(pipe, args);
            await pipe.FlushAsync();
        }
        catch { }
    }

    public void Dispose()
    {
        _cts?.Cancel();
        try { _mutex?.ReleaseMutex(); } catch { }
        _mutex?.Dispose();
        _cts?.Dispose();
    }
}
