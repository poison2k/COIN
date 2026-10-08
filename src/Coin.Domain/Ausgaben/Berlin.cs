namespace Coin.Domain.Ausgaben;

/// <summary>Kalendertag nach Europe/Berlin (coin-ausgaben F8), unabhängig vom Offset des Zeitpunkts.</summary>
public static class Berlin
{
    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");

    public static DateOnly Heute(DateTimeOffset jetzt) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(jetzt, Zone).DateTime);
}
