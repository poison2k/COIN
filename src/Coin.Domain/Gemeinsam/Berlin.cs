namespace Coin.Domain.Gemeinsam;

/// <summary>
/// Kalendertage nach Europe/Berlin (coin-ausgaben F8, nacharbeiten-audit-filter 4.1), unabhängig vom Offset des
/// Zeitpunkts.
/// </summary>
public static class Berlin
{
    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");

    public static DateOnly Heute(DateTimeOffset jetzt) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(jetzt, Zone).DateTime);

    /// <summary>
    /// Beginn des Kalendertags (00:00 Europe/Berlin) als UTC-Zeitpunkt (Offset 0). Liegt Mitternacht in einer
    /// Lücke der Zeitumstellung, gilt der nächste gültige Zeitpunkt; ist sie doppelt, der frühere.
    /// </summary>
    public static DateTimeOffset TagesbeginnUtc(DateOnly tag)
    {
        var lokal = tag.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        while (Zone.IsInvalidTime(lokal))
        {
            lokal = lokal.AddMinutes(1);
        }

        var versatz = Zone.IsAmbiguousTime(lokal)
            ? Zone.GetAmbiguousTimeOffsets(lokal).Max()
            : Zone.GetUtcOffset(lokal);
        return new DateTimeOffset(lokal - versatz, TimeSpan.Zero);
    }
}
