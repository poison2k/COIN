using Coin.Domain.Ausgaben;
using Coin.Domain.Gemeinsam;

namespace Coin.UnitTests.Gemeinsam;

/// <summary>
/// Feature nacharbeiten-audit-filter, Abschnitt 4.1 und AK-10 (ADR-0045 Punkt 2): <c>Berlin.TagesbeginnUtc(DateOnly)</c>
/// liefert 00:00 Europe/Berlin des Kalendertags als UTC-Zeitpunkt. Daraus folgen 23 Stunden am 29.03.2026 und
/// 25 Stunden am 25.10.2026. Der Typ darf nach <c>Coin.Domain.Gemeinsam</c> wandern (beide Namespaces eingebunden).
/// </summary>
public class BerlinTests
{
    private static DateTimeOffset Utc(int jahr, int monat, int tag, int stunde) =>
        new(jahr, monat, tag, stunde, 0, 0, TimeSpan.Zero);

    public static TheoryData<DateOnly, DateTimeOffset> Stichtage => new()
    {
        { new DateOnly(2026, 1, 15), Utc(2026, 1, 14, 23) },
        { new DateOnly(2026, 3, 29), Utc(2026, 3, 28, 23) },
        { new DateOnly(2026, 3, 30), Utc(2026, 3, 29, 22) },
        { new DateOnly(2026, 7, 1), Utc(2026, 6, 30, 22) },
        { new DateOnly(2026, 10, 25), Utc(2026, 10, 24, 22) },
        { new DateOnly(2026, 10, 26), Utc(2026, 10, 25, 23) },
    };

    [Theory]
    [MemberData(nameof(Stichtage))]
    public void Tagesbeginn_ist_Mitternacht_in_Berlin_als_UTC(DateOnly tag, DateTimeOffset erwartet)
    {
        var beginn = Berlin.TagesbeginnUtc(tag);

        Assert.Equal(erwartet.UtcDateTime, beginn.UtcDateTime);
    }

    [Theory]
    [MemberData(nameof(Stichtage))]
    public void Tagesbeginn_hat_den_Offset_null(DateOnly tag, DateTimeOffset erwartet)
    {
        _ = erwartet;

        Assert.Equal(TimeSpan.Zero, Berlin.TagesbeginnUtc(tag).Offset);
    }

    [Fact]
    public void Der_29_Maerz_2026_hat_23_Stunden()
    {
        var dauer = Berlin.TagesbeginnUtc(new DateOnly(2026, 3, 30)) - Berlin.TagesbeginnUtc(new DateOnly(2026, 3, 29));

        Assert.Equal(TimeSpan.FromHours(23), dauer);
    }

    [Fact]
    public void Der_25_Oktober_2026_hat_25_Stunden()
    {
        var dauer = Berlin.TagesbeginnUtc(new DateOnly(2026, 10, 26)) - Berlin.TagesbeginnUtc(new DateOnly(2026, 10, 25));

        Assert.Equal(TimeSpan.FromHours(25), dauer);
    }

    [Fact]
    public void Ein_gewoehnlicher_Wintertag_hat_24_Stunden()
    {
        var dauer = Berlin.TagesbeginnUtc(new DateOnly(2026, 1, 16)) - Berlin.TagesbeginnUtc(new DateOnly(2026, 1, 15));

        Assert.Equal(TimeSpan.FromHours(24), dauer);
    }

    [Fact]
    public void Tagesbeginn_passt_zu_Heute_am_selben_Kalendertag()
    {
        var tag = new DateOnly(2026, 10, 25);

        Assert.Equal(tag, Berlin.Heute(Berlin.TagesbeginnUtc(tag)));
    }

    [Fact]
    public void Eine_Mikrosekunde_vor_dem_Tagesbeginn_ist_noch_der_Vortag()
    {
        var tag = new DateOnly(2026, 3, 29);

        Assert.Equal(new DateOnly(2026, 3, 28), Berlin.Heute(Berlin.TagesbeginnUtc(tag).AddTicks(-10)));
    }

    [Theory]
    [InlineData(2000, 1, 1)]
    [InlineData(2999, 12, 31)]
    public void Tagesbeginn_funktioniert_an_den_Bereichsgrenzen(int jahr, int monat, int tag)
    {
        var datum = new DateOnly(jahr, monat, tag);

        Assert.Equal(datum, Berlin.Heute(Berlin.TagesbeginnUtc(datum)));
    }
}
