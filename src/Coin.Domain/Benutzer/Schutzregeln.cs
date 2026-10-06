namespace Coin.Domain.Benutzer;

/// <summary>Eine Änderung an einem Benutzer durch die Benutzerverwaltung.</summary>
public abstract record Aenderung
{
    private Aenderung()
    {
    }

    /// <summary>Rolle setzen; <c>null</c> = Rolle entziehen.</summary>
    public sealed record RolleSetzen(Rolle? Rolle) : Aenderung;

    /// <summary>Aktivieren (<c>true</c>) oder deaktivieren (<c>false</c>).</summary>
    public sealed record StatusSetzen(bool Aktiv) : Aenderung;
}

/// <summary>Ergebnis der Prüfung in <see cref="Schutzregeln.Pruefen"/>.</summary>
public enum Schutzpruefung
{
    Erlaubt,
    NichtGefunden,
    Unveraendert,
    AkteurNichtBerechtigt,
    EigenesKonto,
    LetzterAdministrator,
}

/// <summary>
/// Schutzregeln der Benutzerverwaltung als reine Funktion (ADR-0018 Punkt 1, AK-15, AK-16, AK-18). Reihenfolge:
/// NichtGefunden → Unveraendert → AkteurNichtBerechtigt → EigenesKonto → LetzterAdministrator → Erlaubt.
/// </summary>
public static class Schutzregeln
{
    public static Schutzpruefung Pruefen(Benutzer? akteur, Benutzer? ziel, Aenderung aenderung, int anzahlAktiverAdmins)
    {
        ArgumentNullException.ThrowIfNull(aenderung);

        if (ziel is null)
        {
            return Schutzpruefung.NichtGefunden;
        }

        if (IstUnveraendert(ziel, aenderung))
        {
            return Schutzpruefung.Unveraendert;
        }

        if (akteur is null || !Rechtematrix.Hat(akteur, Berechtigungen.UsersManage))
        {
            return Schutzpruefung.AkteurNichtBerechtigt;
        }

        var nimmtAdminrecht = NimmtAdminrecht(ziel, aenderung);
        if (nimmtAdminrecht && akteur.Id == ziel.Id)
        {
            return Schutzpruefung.EigenesKonto;
        }

        if (nimmtAdminrecht && ziel.IstAktiverAdministrator && anzahlAktiverAdmins <= 1)
        {
            return Schutzpruefung.LetzterAdministrator;
        }

        return Schutzpruefung.Erlaubt;
    }

    /// <summary>Der neue Zustand des Benutzers nach der Änderung.</summary>
    public static Benutzer Anwenden(Benutzer ziel, Aenderung aenderung, DateTimeOffset jetzt)
    {
        ArgumentNullException.ThrowIfNull(ziel);
        return aenderung switch
        {
            Aenderung.RolleSetzen r => ziel with { Rolle = r.Rolle, AktualisiertAm = jetzt },
            Aenderung.StatusSetzen s => ziel with { Aktiv = s.Aktiv, AktualisiertAm = jetzt },
            _ => throw new ArgumentOutOfRangeException(nameof(aenderung)),
        };
    }

    private static bool IstUnveraendert(Benutzer ziel, Aenderung aenderung) => aenderung switch
    {
        Aenderung.RolleSetzen r => ziel.Rolle == r.Rolle,
        Aenderung.StatusSetzen s => ziel.Aktiv == s.Aktiv,
        _ => throw new ArgumentOutOfRangeException(nameof(aenderung)),
    };

    /// <summary>Entzieht die Änderung einem Administrator die Rolle oder deaktiviert sie den Benutzer?</summary>
    private static bool NimmtAdminrecht(Benutzer ziel, Aenderung aenderung) => aenderung switch
    {
        Aenderung.RolleSetzen r => ziel.Rolle == Rolle.Administrator && r.Rolle != Rolle.Administrator,
        Aenderung.StatusSetzen s => !s.Aktiv,
        _ => throw new ArgumentOutOfRangeException(nameof(aenderung)),
    };
}
