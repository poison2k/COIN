using System.Globalization;
using Coin.Api.Http;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging;

namespace Coin.IntegrationTests.Http;

/// <summary>
/// rollen-benutzerverwaltung Rev. 3, AK-46/ADR-0019 (QA-Nacharbeit): Status im Request-Protokoll bei Ausnahmen.
/// Direkt gegen die Middleware mit <see cref="DefaultHttpContext"/>, ohne Datenbank und ohne Testhost (liegt hier, weil
/// nur das Integrationstest-Projekt <c>Coin.Api</c> referenziert).
/// - Ausnahme nach Antwortbeginn: protokolliert wird der tatsächlich gesendete Status, nicht 500.
/// - Abbruch durch den Client (<see cref="OperationCanceledException"/> bei abgebrochenem <c>RequestAborted</c>): 499.
/// </summary>
public sealed class AnfrageProtokollMiddlewareTests : IDisposable
{
    private const string Kategorie = "Coin.Api.Http.AnfrageProtokoll";

    private readonly SammelLoggerProvider _logs = new();
    private readonly ILoggerFactory _loggerFactory;

    public AnfrageProtokollMiddlewareTests()
    {
        _loggerFactory = LoggerFactory.Create(b => b.AddProvider(_logs).SetMinimumLevel(LogLevel.Trace));
    }

    public void Dispose() => _loggerFactory.Dispose();

    private AnfrageProtokoll Middleware(RequestDelegate next) =>
        new(next, _loggerFactory.CreateLogger<AnfrageProtokoll>(), TimeProvider.System);

    private static DefaultHttpContext Kontext(AntwortFeature antwort)
    {
        var context = new DefaultHttpContext();
        context.Features.Set<IHttpResponseFeature>(antwort);
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/api/coins";
        return context;
    }

    private string ProtokollierterStatus()
    {
        var eintrag = Assert.Single(_logs.Strukturiert, e => e.Kategorie == Kategorie);
        Assert.True(eintrag.Werte.TryGetValue("Status", out var wert), $"Feld Status fehlt in: {eintrag.Text}");
        return Convert.ToString(wert, CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static async Task AusfuehrenOhneAusnahmeAsync(AnfrageProtokoll middleware, HttpContext context)
    {
        try
        {
            await middleware.InvokeAsync(context);
        }
        catch (Exception e) when (e is InvalidOperationException or OperationCanceledException)
        {
            // Ob die Middleware die Ausnahme weiterreicht, prüfen eigene Tests; hier zählt nur der Protokolleintrag.
        }
    }

    [Fact]
    public async Task Protokolliert_bei_Ausnahme_vor_Antwortbeginn_500()
    {
        var antwort = new AntwortFeature();
        var context = Kontext(antwort);
        var middleware = Middleware(_ => throw new InvalidOperationException("Testfehler vor Antwortbeginn"));

        await AusfuehrenOhneAusnahmeAsync(middleware, context);

        Assert.Equal("500", ProtokollierterStatus());
    }

    [Fact]
    public async Task Protokolliert_bei_Ausnahme_nach_Antwortbeginn_den_gesendeten_Status()
    {
        var antwort = new AntwortFeature();
        var context = Kontext(antwort);
        var middleware = Middleware(ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            antwort.Starten();
            throw new InvalidOperationException("Testfehler nach Antwortbeginn");
        });

        await AusfuehrenOhneAusnahmeAsync(middleware, context);

        Assert.Equal("200", ProtokollierterStatus());
    }

    [Fact]
    public async Task Protokolliert_bei_Ausnahme_nach_Antwortbeginn_auch_einen_Fehlerstatus_unveraendert()
    {
        var antwort = new AntwortFeature();
        var context = Kontext(antwort);
        var middleware = Middleware(ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status404NotFound;
            antwort.Starten();
            throw new InvalidOperationException("Testfehler nach Antwortbeginn");
        });

        await AusfuehrenOhneAusnahmeAsync(middleware, context);

        Assert.Equal("404", ProtokollierterStatus());
    }

    [Fact]
    public async Task Reicht_eine_Ausnahme_nach_Antwortbeginn_weiter()
    {
        var antwort = new AntwortFeature();
        var context = Kontext(antwort);
        var middleware = Middleware(ctx =>
        {
            antwort.Starten();
            throw new InvalidOperationException("Testfehler nach Antwortbeginn");
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() => middleware.InvokeAsync(context));
    }

    [Fact]
    public async Task Protokolliert_einen_Abbruch_durch_den_Client_als_499()
    {
        using var abbruch = new CancellationTokenSource();
        var context = Kontext(new AntwortFeature());
        context.RequestAborted = abbruch.Token;
        var middleware = Middleware(ctx =>
        {
            abbruch.Cancel();
            ctx.RequestAborted.ThrowIfCancellationRequested();
            return Task.CompletedTask;
        });

        await AusfuehrenOhneAusnahmeAsync(middleware, context);

        Assert.Equal("499", ProtokollierterStatus());
    }

    [Fact]
    public async Task Protokolliert_einen_Abbruch_durch_den_Client_auch_als_TaskCanceledException_als_499()
    {
        using var abbruch = new CancellationTokenSource();
        var context = Kontext(new AntwortFeature());
        context.RequestAborted = abbruch.Token;
        var middleware = Middleware(async ctx =>
        {
            abbruch.Cancel();
            await Task.Delay(Timeout.Infinite, ctx.RequestAborted);
        });

        await AusfuehrenOhneAusnahmeAsync(middleware, context);

        Assert.Equal("499", ProtokollierterStatus());
    }

    [Fact]
    public async Task Protokolliert_einen_Abbruch_ohne_Client_Abbruch_als_500()
    {
        // Abbruch aus einer anderen Quelle (z. B. interner Timeout): kein Client-Abbruch, also 500.
        var context = Kontext(new AntwortFeature());
        var middleware = Middleware(_ => throw new OperationCanceledException("interner Abbruch"));

        await AusfuehrenOhneAusnahmeAsync(middleware, context);

        Assert.Equal("500", ProtokollierterStatus());
    }

    [Fact]
    public async Task Protokolliert_ohne_Ausnahme_den_gesetzten_Status()
    {
        var context = Kontext(new AntwortFeature());
        var middleware = Middleware(ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status204NoContent;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(context);

        Assert.Equal("204", ProtokollierterStatus());
    }

    /// <summary>Antwort-Feature, dessen <see cref="HasStarted"/> der Test setzt (Antwortbeginn ohne echten Server).</summary>
    private sealed class AntwortFeature : IHttpResponseFeature
    {
        private bool _gestartet;

        public int StatusCode { get; set; } = StatusCodes.Status200OK;

        public string? ReasonPhrase { get; set; }

        public IHeaderDictionary Headers { get; set; } = new HeaderDictionary();

        public Stream Body { get; set; } = Stream.Null;

        public bool HasStarted => _gestartet;

        public void Starten() => _gestartet = true;

        public void OnStarting(Func<object, Task> callback, object state)
        {
        }

        public void OnCompleted(Func<object, Task> callback, object state)
        {
        }
    }
}
