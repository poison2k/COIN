using Coin.Domain.Vorlagen;

namespace Coin.Api.Http;

/// <summary>
/// Betriebsprotokoll der Aufbereitung von Zertifikatsvorlagen (zertifikatsvorlagen AK-16, G3; ADR-0024 Punkt 3 und 5):
/// je Fall genau eine Warnung mit fester EventId und fester Meldung, ohne Ausnahmeobjekt, ohne Parameter und ohne
/// Dokumentinhalte, Dateinamen oder Befundtexte.
/// </summary>
internal sealed partial class VorlagenProtokoll(ILogger<VorlagenProtokoll> logger) : IVorlagenProtokoll
{
    public void BereinigungFehlgeschlagen() => BereinigungFehlgeschlagen(logger);

    public void NachpruefungFehlgeschlagen() => NachpruefungFehlgeschlagen(logger);

    [LoggerMessage(EventId = 2401, EventName = "VorlageBereinigungFehlgeschlagen", Level = LogLevel.Warning,
        Message = "Bereinigung einer Zertifikatsvorlage fehlgeschlagen.")]
    private static partial void BereinigungFehlgeschlagen(ILogger logger);

    [LoggerMessage(EventId = 2402, EventName = "VorlageNachpruefungFehlgeschlagen", Level = LogLevel.Warning,
        Message = "Nachprüfung einer bereinigten Zertifikatsvorlage fehlgeschlagen.")]
    private static partial void NachpruefungFehlgeschlagen(ILogger logger);
}
