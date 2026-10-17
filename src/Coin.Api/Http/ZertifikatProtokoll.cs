using Coin.Domain.Zertifikate;

namespace Coin.Api.Http;

/// <summary>
/// Betriebsprotokoll der Zertifikatserzeugung (zertifikat-erzeugen AK-17, ADR-0028 Punkt 9; Muster
/// <see cref="VorlagenProtokoll"/>): genau eine Warnung mit fester EventId und fester Meldung, ohne Ausnahmeobjekt, ohne
/// Parameter und ohne Werte der Ausgabe, Coin-Daten, Zertifikatsnummer oder Dateiinhalte.
/// </summary>
internal sealed partial class ZertifikatProtokoll(ILogger<ZertifikatProtokoll> logger) : IZertifikatProtokoll
{
    public void ErzeugungFehlgeschlagen() => ErzeugungFehlgeschlagen(logger);

    [LoggerMessage(EventId = 2501, EventName = "ZertifikatErzeugungFehlgeschlagen", Level = LogLevel.Warning,
        Message = "Erzeugung eines Zertifikats fehlgeschlagen.")]
    private static partial void ErzeugungFehlgeschlagen(ILogger logger);
}
