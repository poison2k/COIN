using Coin.Domain.Benutzer;
using Microsoft.Extensions.Time.Testing;
using DomainBenutzer = Coin.Domain.Benutzer.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>Feature anmeldung-keycloak, AK-13 und AK-16: Abgleich-Service mit Fake-Repository.</summary>
public class BenutzerAbgleichServiceTests
{
    private const string AdminEmail = "admin@coin-test.invalid";
    private static readonly DateTimeOffset Startzeit = new(2026, 10, 5, 9, 15, 0, TimeSpan.Zero);

    private readonly FakeBenutzerRepository _repository = new();
    private readonly FakeTimeProvider _zeit = new(Startzeit);

    private BenutzerAbgleichService Service(params string[] adminEmails) =>
        new(_repository, new BootstrapAdmins(adminEmails), _zeit);

    private static BenutzerIdentitaet Identitaet(string? email = AdminEmail, bool verifiziert = true) =>
        BenutzerIdentitaet.Erstellen("https://idp.coin-test.invalid/realms/coin-test", "sub-1", email, verifiziert, "Test Person", null);

    [Fact]
    public async Task Uebergibt_die_Identitaet_unveraendert_an_das_Repository()
    {
        var identitaet = Identitaet();

        await Service().AbgleichenAsync(identitaet, CancellationToken.None);

        Assert.Equal(identitaet, Assert.Single(_repository.Aufrufe).Identitaet);
    }

    [Fact]
    public async Task Uebergibt_Administrator_als_Rolle_bei_Neuanlage_fuer_den_Bootstrap_Admin()
    {
        await Service(AdminEmail).AbgleichenAsync(Identitaet(), CancellationToken.None);

        Assert.Equal(Rolle.Administrator, Assert.Single(_repository.Aufrufe).RolleBeiNeuanlage);
    }

    [Fact]
    public async Task Uebergibt_keine_Rolle_bei_nicht_verifizierter_Email()
    {
        await Service(AdminEmail).AbgleichenAsync(Identitaet(verifiziert: false), CancellationToken.None);

        Assert.Null(Assert.Single(_repository.Aufrufe).RolleBeiNeuanlage);
    }

    [Fact]
    public async Task Uebergibt_keine_Rolle_fuer_eine_Email_ausserhalb_der_Liste()
    {
        await Service(AdminEmail).AbgleichenAsync(Identitaet("andere@coin-test.invalid"), CancellationToken.None);

        Assert.Null(Assert.Single(_repository.Aufrufe).RolleBeiNeuanlage);
    }

    [Fact]
    public async Task Uebergibt_die_aktuelle_Zeit_aus_dem_TimeProvider()
    {
        _zeit.Advance(TimeSpan.FromMinutes(42));

        await Service().AbgleichenAsync(Identitaet(), CancellationToken.None);

        Assert.Equal(Startzeit.AddMinutes(42), Assert.Single(_repository.Aufrufe).Jetzt);
    }

    [Fact]
    public async Task Kuerzt_die_Zeit_auf_Mikrosekunden_wie_PostgreSQL()
    {
        _zeit.SetUtcNow(Startzeit.AddTicks(1_234_567));

        await Service().AbgleichenAsync(Identitaet(), CancellationToken.None);

        Assert.Equal(Startzeit.AddTicks(1_234_560), Assert.Single(_repository.Aufrufe).Jetzt);
    }

    [Fact]
    public async Task Uebergibt_die_Zeit_in_UTC()
    {
        await Service().AbgleichenAsync(Identitaet(), CancellationToken.None);

        Assert.Equal(TimeSpan.Zero, Assert.Single(_repository.Aufrufe).Jetzt.Offset);
    }

    [Fact]
    public async Task Liefert_den_Benutzer_aus_dem_Repository()
    {
        var erwartet = new DomainBenutzer(Guid.CreateVersion7(), "iss", "sub-1", AdminEmail, "Test Person", Rolle.Betrachter, Startzeit, Startzeit);
        _repository.Antwort = erwartet;

        var benutzer = await Service(AdminEmail).AbgleichenAsync(Identitaet(), CancellationToken.None);

        Assert.Same(erwartet, benutzer);
    }

    [Fact]
    public async Task Reicht_das_CancellationToken_weiter()
    {
        using var quelle = new CancellationTokenSource();

        await Service().AbgleichenAsync(Identitaet(), quelle.Token);

        Assert.Equal(quelle.Token, Assert.Single(_repository.Aufrufe).Ct);
    }

    private sealed class FakeBenutzerRepository : IBenutzerRepository
    {
        public List<(BenutzerIdentitaet Identitaet, Rolle? RolleBeiNeuanlage, DateTimeOffset Jetzt, CancellationToken Ct)> Aufrufe { get; } = [];

        public DomainBenutzer? Antwort { get; set; }

        public Task<DomainBenutzer> AbgleichenAsync(BenutzerIdentitaet identitaet, Rolle? rolleBeiNeuanlage, DateTimeOffset jetzt, CancellationToken ct)
        {
            Aufrufe.Add((identitaet, rolleBeiNeuanlage, jetzt, ct));
            return Task.FromResult(Antwort ?? new DomainBenutzer(
                Guid.CreateVersion7(), identitaet.Issuer, identitaet.Subject, identitaet.Email, identitaet.Anzeigename,
                rolleBeiNeuanlage, jetzt, jetzt));
        }
    }
}
