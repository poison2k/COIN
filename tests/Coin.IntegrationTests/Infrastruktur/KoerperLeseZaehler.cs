using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Misst, wie viele Bytes die Anwendung (Middleware, Autorisierung, Controller) vom Request-Body liest.
/// Ein Startfilter legt sich ganz außen um die Pipeline; ein späteres Verwerfen des Rests durch den Server zählt nicht.
/// </summary>
public sealed class KoerperLeseZaehler
{
    private long _gelesen;

    public long GelesenBytes => Interlocked.Read(ref _gelesen);

    public void Zuruecksetzen() => Interlocked.Exchange(ref _gelesen, 0);

    internal sealed class Filter(KoerperLeseZaehler zaehler) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (context, weiter) =>
            {
                var original = context.Request.Body;
                context.Request.Body = new ZaehlStream(original, zaehler);
                try
                {
                    await weiter(context);
                }
                finally
                {
                    context.Request.Body = original;
                }
            });
            next(app);
        };
    }

    private sealed class ZaehlStream(Stream inner, KoerperLeseZaehler zaehler) : Stream
    {
        public override bool CanRead => inner.CanRead;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => inner.Length;

        public override long Position
        {
            get => inner.Position;
            set => throw new NotSupportedException();
        }

        public override void Flush() => inner.Flush();

        public override int Read(byte[] buffer, int offset, int count) => Zaehle(inner.Read(buffer, offset, count));

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            Zaehle(await inner.ReadAsync(buffer, cancellationToken));

        public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
            Zaehle(await inner.ReadAsync(buffer.AsMemory(offset, count), cancellationToken));

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        private int Zaehle(int gelesen)
        {
            Interlocked.Add(ref zaehler._gelesen, gelesen);
            return gelesen;
        }
    }
}
