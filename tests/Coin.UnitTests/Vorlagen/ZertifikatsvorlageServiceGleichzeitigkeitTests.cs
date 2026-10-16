using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 3, AK-12 „Gleichzeitige Aufbereitungen“ (QA-Finding G1, ADR-0024 Punkt 7): Je
/// <see cref="ZertifikatsvorlageService"/> (in der API ein Singleton bzw. prozessweit) durchlaufen höchstens zwei
/// Uploads gleichzeitig Prüfung, Bereinigung und Nachprüfung. Der Platz wird nach dem 404-Check belegt und nach der
/// Nachprüfung freigegeben – auch bei Fehlern. Weitere Uploads warten asynchron und brechen mit dem
/// <see cref="CancellationToken"/> ab. Die Fake-Analyse blockiert, bis der Test sie freigibt.
/// </summary>
public class ZertifikatsvorlageServiceGleichzeitigkeitTests
{
    private const int Erlaubt = 2;

    private static readonly TimeSpan Wartezeit = TimeSpan.FromSeconds(10);

    private static readonly Guid BekannterCoin = Guid.Parse("0199a1b2-0000-7000-8000-0000000000a1");

    private static readonly Guid UnbekannterCoin = Guid.Parse("0199a1b2-0000-7000-8000-0000000000ff");

    private static readonly Guid Akteur = Guid.Parse("0199a1b2-0000-7000-8000-0000000000b1");

    private static readonly string[] PflichtAbsaetze =
        ["{{Coin.Name}}", "{{Exemplar.Nummer}}", "{{Zertifikat.Nummer}}", "{{Empfaenger.Name}}"];

    private static readonly byte[] Bereinigt = [9, 8, 7];

    /// <summary>Blockiert die Analyse von Originaldateien, bis <see cref="Freigeben"/> aufgerufen wird.</summary>
    private sealed class BlockierendeAnalyse : IDocxAnalyse
    {
        private readonly ManualResetEventSlim _freigabe = new(false);
        private readonly object _sperre = new();
        private int _laufend;
        private int _hoechstwert;

        public int Laufend
        {
            get
            {
                lock (_sperre)
                {
                    return _laufend;
                }
            }
        }

        public int Hoechstwert
        {
            get
            {
                lock (_sperre)
                {
                    return _hoechstwert;
                }
            }
        }

        public void Freigeben() => _freigabe.Set();

        public DocxBefund Analysieren(byte[] inhalt)
        {
            if (ReferenceEquals(inhalt, Bereinigt))
            {
                return new DocxBefund.Gelesen(PflichtAbsaetze);
            }

            lock (_sperre)
            {
                _laufend++;
                _hoechstwert = Math.Max(_hoechstwert, _laufend);
            }

            try
            {
                // Zeitgrenze, damit ein Fehler den Testlauf nicht aufhängt.
                _freigabe.Wait(Wartezeit);
                return new DocxBefund.Gelesen(PflichtAbsaetze);
            }
            finally
            {
                lock (_sperre)
                {
                    _laufend--;
                }
            }
        }
    }

    private sealed class FesteBereinigung : IDocxBereinigung
    {
        public byte[] Bereinigen(byte[] inhalt) => Bereinigt;
    }

    private sealed class WerfendeBereinigung : IDocxBereinigung
    {
        public byte[] Bereinigen(byte[] inhalt) => throw new InvalidOperationException("Testfehler der Bereinigung");
    }

    private sealed class SofortigeAnalyse : IDocxAnalyse
    {
        public DocxBefund Analysieren(byte[] inhalt) => new DocxBefund.Gelesen(PflichtAbsaetze);
    }

    private sealed class FakeStandard : IStandardvorlage
    {
        public byte[] Inhalt { get; } = [1];
    }

    private sealed class FakeRepository : IZertifikatsvorlageRepository
    {
        private int _version;

        public Task<bool> CoinExistiertAsync(Guid coinId, CancellationToken ct) => Task.FromResult(coinId == BekannterCoin);

        public Task<VorlagenStatus?> StatusAsync(Guid coinId, CancellationToken ct) =>
            Task.FromResult<VorlagenStatus?>(coinId == BekannterCoin ? new VorlagenStatus(Volatile.Read(ref _version), []) : null);

        public Task<(int? Version, byte[]? Inhalt)?> AktiveAsync(Guid coinId, CancellationToken ct) =>
            Task.FromResult<(int? Version, byte[]? Inhalt)?>(null);

        public Task<byte[]?> VersionInhaltAsync(Guid coinId, int version, CancellationToken ct) => Task.FromResult<byte[]?>(null);

        public Task<bool> VersionHinzufuegenAsync(NeueVorlage vorlage, CancellationToken ct)
        {
            Interlocked.Increment(ref _version);
            return Task.FromResult(vorlage.CoinId == BekannterCoin);
        }

        public Task<bool> ZuruecksetzenAsync(Guid coinId, Guid akteurId, DateTimeOffset zeitpunkt, CancellationToken ct) =>
            Task.FromResult(coinId == BekannterCoin);
    }

    private static ZertifikatsvorlageService Service(IDocxAnalyse analyse, IDocxBereinigung? bereinigung = null) =>
        new(new FakeRepository(), new VorlagenAufbereitung(analyse, bereinigung ?? new FesteBereinigung()), new FakeStandard(), TimeProvider.System);

    /// <summary>Startet einen Upload auf einem eigenen Thread (die Fake-Analyse blockiert synchron).</summary>
    private static Task<VorlageHochladenErgebnis> Hochladen(
        ZertifikatsvorlageService service, Guid coinId, CancellationToken ct = default) =>
        Task.Factory.StartNew(
            () => service.HochladenAsync(coinId, [1, 2, 3], Akteur, ct),
            CancellationToken.None,
            TaskCreationOptions.LongRunning,
            TaskScheduler.Default).Unwrap();

    private static async Task WarteBisAsync(Func<bool> bedingung)
    {
        var ende = DateTime.UtcNow + Wartezeit;
        while (!bedingung() && DateTime.UtcNow < ende)
        {
            await Task.Delay(10);
        }
    }

    [Fact]
    public async Task Hoechstens_zwei_Uploads_werden_gleichzeitig_aufbereitet()
    {
        var analyse = new BlockierendeAnalyse();
        var service = Service(analyse);

        var aufgaben = Enumerable.Range(0, 5).Select(_ => Hochladen(service, BekannterCoin)).ToList();
        await WarteBisAsync(() => analyse.Laufend >= Erlaubt);
        await Task.Delay(300);
        var laufend = analyse.Laufend;
        analyse.Freigeben();
        await Task.WhenAll(aufgaben).WaitAsync(Wartezeit);

        Assert.Equal(Erlaubt, laufend);
        Assert.Equal(Erlaubt, analyse.Hoechstwert);
    }

    [Fact]
    public async Task Wartende_Uploads_laufen_nach_der_Freigabe_vollstaendig_durch()
    {
        var analyse = new BlockierendeAnalyse();
        var service = Service(analyse);

        var aufgaben = Enumerable.Range(0, 5).Select(_ => Hochladen(service, BekannterCoin)).ToList();
        await WarteBisAsync(() => analyse.Laufend >= Erlaubt);
        analyse.Freigeben();
        var ergebnisse = await Task.WhenAll(aufgaben).WaitAsync(Wartezeit);

        Assert.All(ergebnisse, e => Assert.IsType<VorlageHochladenErgebnis.Gespeichert>(e));
    }

    [Fact]
    public async Task Zwei_gleichzeitige_Uploads_warten_nicht_aufeinander()
    {
        var analyse = new BlockierendeAnalyse();
        var service = Service(analyse);

        var aufgaben = Enumerable.Range(0, Erlaubt).Select(_ => Hochladen(service, BekannterCoin)).ToList();
        await WarteBisAsync(() => analyse.Laufend >= Erlaubt);
        var laufend = analyse.Laufend;
        analyse.Freigeben();
        await Task.WhenAll(aufgaben).WaitAsync(Wartezeit);

        Assert.Equal(Erlaubt, laufend);
    }

    [Fact]
    public async Task Wartender_Upload_bricht_mit_dem_CancellationToken_ab()
    {
        var analyse = new BlockierendeAnalyse();
        var service = Service(analyse);
        var belegt = Enumerable.Range(0, Erlaubt).Select(_ => Hochladen(service, BekannterCoin)).ToList();
        await WarteBisAsync(() => analyse.Laufend >= Erlaubt);
        using var abbruch = new CancellationTokenSource();

        var wartend = Hochladen(service, BekannterCoin, abbruch.Token);
        await Task.Delay(100);
        await abbruch.CancelAsync();

        try
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => wartend.WaitAsync(TimeSpan.FromSeconds(2)));
        }
        finally
        {
            analyse.Freigeben();
            await Task.WhenAll(belegt).WaitAsync(Wartezeit);
        }
    }

    [Fact]
    public async Task Abgebrochener_wartender_Upload_ruft_die_Analyse_nie_auf()
    {
        var analyse = new BlockierendeAnalyse();
        var service = Service(analyse);
        var belegt = Enumerable.Range(0, Erlaubt).Select(_ => Hochladen(service, BekannterCoin)).ToList();
        await WarteBisAsync(() => analyse.Laufend >= Erlaubt);
        using var abbruch = new CancellationTokenSource();
        var wartend = Hochladen(service, BekannterCoin, abbruch.Token);
        await Task.Delay(100);
        await abbruch.CancelAsync();
        await Task.WhenAny(wartend, Task.Delay(TimeSpan.FromSeconds(2)));

        var hoechstwert = analyse.Hoechstwert;
        analyse.Freigeben();
        await Task.WhenAll(belegt).WaitAsync(Wartezeit);

        Assert.Equal(Erlaubt, hoechstwert);
    }

    [Fact]
    public async Task Unbekannter_Coin_wartet_nicht_auf_einen_Platz()
    {
        var analyse = new BlockierendeAnalyse();
        var service = Service(analyse);
        var belegt = Enumerable.Range(0, Erlaubt).Select(_ => Hochladen(service, BekannterCoin)).ToList();
        await WarteBisAsync(() => analyse.Laufend >= Erlaubt);

        try
        {
            var ergebnis = await Hochladen(service, UnbekannterCoin).WaitAsync(TimeSpan.FromSeconds(2));

            Assert.IsType<VorlageHochladenErgebnis.CoinNichtGefunden>(ergebnis);
        }
        finally
        {
            analyse.Freigeben();
            await Task.WhenAll(belegt).WaitAsync(Wartezeit);
        }
    }

    [Fact]
    public async Task Ausnahme_in_der_Bereinigung_wird_zur_Ablehnung_statt_zur_Ausnahme()
    {
        var service = Service(new SofortigeAnalyse(), new WerfendeBereinigung());

        var ergebnis = await service.HochladenAsync(BekannterCoin, [1, 2, 3], Akteur, CancellationToken.None);

        Assert.Equal(
            ["Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen."],
            Assert.IsType<VorlageHochladenErgebnis.Abgelehnt>(ergebnis).Meldungen);
    }

    [Fact]
    public async Task Nach_Ausnahmen_in_der_Bereinigung_werden_die_Plaetze_wieder_frei()
    {
        var service = Service(new SofortigeAnalyse(), new WerfendeBereinigung());

        // Mehr fehlgeschlagene Uploads als Plätze: würde ein Platz nicht freigegeben, bliebe der letzte Aufruf hängen.
        for (var i = 0; i < Erlaubt + 2; i++)
        {
            await service.HochladenAsync(BekannterCoin, [1, 2, 3], Akteur, CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(2));
        }
    }

    [Fact]
    public async Task Nach_Ausnahmen_in_der_Analyse_werden_die_Plaetze_wieder_frei()
    {
        var service = Service(new WerfendeAnalyse());

        for (var i = 0; i < Erlaubt + 2; i++)
        {
            try
            {
                await service.HochladenAsync(BekannterCoin, [1, 2, 3], Akteur, CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(2));
            }
            catch (InvalidOperationException)
            {
                // Ob die Ausnahme durchgereicht oder zur Ablehnung wird, ist hier gleich; nur der Platz zählt.
            }
        }
    }

    [Fact]
    public async Task Zwei_Service_Instanzen_mit_derselben_Aufbereitung_teilen_sich_die_Plaetze()
    {
        // Rev. 4, H5: Die Grenze sitzt in der (prozessweiten) VorlagenAufbereitung, nicht im scoped Service.
        var analyse = new BlockierendeAnalyse();
        var aufbereitung = new VorlagenAufbereitung(analyse, new FesteBereinigung());
        var erster = new ZertifikatsvorlageService(new FakeRepository(), aufbereitung, new FakeStandard(), TimeProvider.System);
        var zweiter = new ZertifikatsvorlageService(new FakeRepository(), aufbereitung, new FakeStandard(), TimeProvider.System);

        var aufgaben = new List<Task<VorlageHochladenErgebnis>>
        {
            Hochladen(erster, BekannterCoin),
            Hochladen(zweiter, BekannterCoin),
        };
        await WarteBisAsync(() => analyse.Laufend >= Erlaubt);
        aufgaben.Add(Hochladen(erster, BekannterCoin));
        aufgaben.Add(Hochladen(zweiter, BekannterCoin));
        await Task.Delay(300);
        var laufend = analyse.Laufend;
        analyse.Freigeben();
        await Task.WhenAll(aufgaben).WaitAsync(Wartezeit);

        Assert.Equal(Erlaubt, laufend);
        Assert.Equal(Erlaubt, analyse.Hoechstwert);
    }

    private sealed class WerfendeAnalyse : IDocxAnalyse
    {
        public DocxBefund Analysieren(byte[] inhalt) => throw new InvalidOperationException("Testfehler der Analyse");
    }
}
