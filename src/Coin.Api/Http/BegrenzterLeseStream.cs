namespace Coin.Api.Http;

/// <summary>Überschreitung der Request-Grenze in <see cref="BegrenzterLeseStream"/>.</summary>
internal sealed class RequestZuGrossException : Exception;

/// <summary>
/// Lese-Stream, der nach <c>maxBytes</c> gelesenen Bytes mit <see cref="RequestZuGrossException"/> abbricht
/// (<see cref="MultipartDateiLeser"/>, <see cref="MultipartFormularLeser"/>).
/// </summary>
internal sealed class BegrenzterLeseStream(Stream inner, long maxBytes) : Stream
{
    private long _gelesen;

    public override bool CanRead => true;

    public override bool CanSeek => false;

    public override bool CanWrite => false;

    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override int Read(byte[] buffer, int offset, int count) =>
        Zaehlen(inner.Read(buffer, offset, (int)Math.Min(count, Rest())));

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
        Zaehlen(await inner.ReadAsync(buffer[..(int)Math.Min(buffer.Length, Rest())], cancellationToken));

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    public override void Flush()
    {
    }

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    /// <summary>Ein Byte mehr als erlaubt anfordern, um eine Überschreitung zu erkennen.</summary>
    private long Rest() => Math.Max(1, maxBytes - _gelesen + 1);

    private int Zaehlen(int gelesen)
    {
        _gelesen += gelesen;
        if (_gelesen > maxBytes)
        {
            throw new RequestZuGrossException();
        }

        return gelesen;
    }
}
