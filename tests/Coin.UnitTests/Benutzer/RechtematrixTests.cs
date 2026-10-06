using Coin.Domain.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>Feature anmeldung-keycloak, AK-19 und Entscheidung 1: Rollen-Enum und Schreibrollen.</summary>
public class RollenTests
{
    [Fact]
    public void Enum_Rolle_hat_genau_Administrator_Sachbearbeiter_und_Betrachter()
    {
        Assert.Equal(["Administrator", "Betrachter", "Sachbearbeiter"], Enum.GetNames<Rolle>().Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Katalog_schreiben_duerfen_genau_Administrator_und_Sachbearbeiter()
    {
        Assert.Equal([Rolle.Administrator, Rolle.Sachbearbeiter], Rollen.DuerfenKatalogSchreiben.Order());
    }

    [Fact]
    public void Betrachter_darf_den_Katalog_nicht_schreiben()
    {
        Assert.DoesNotContain(Rolle.Betrachter, Rollen.DuerfenKatalogSchreiben);
    }
}
