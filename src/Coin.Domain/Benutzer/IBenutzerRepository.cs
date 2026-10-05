namespace Coin.Domain.Benutzer;

/// <summary>Persistenz der Benutzer (ADR-0013).</summary>
public interface IBenutzerRepository
{
    /// <summary>
    /// Legt den Benutzer zu (Issuer, Subject) an oder übernimmt geänderte E-Mail und Anzeigename.
    /// Atomar und nebenläufig sicher; schreibt nur bei Änderung. <paramref name="rolleBeiNeuanlage"/> wirkt nur beim
    /// Anlegen, die Rolle eines vorhandenen Benutzers wird nie geändert.
    /// </summary>
    Task<Benutzer> AbgleichenAsync(BenutzerIdentitaet identitaet, Rolle? rolleBeiNeuanlage, DateTimeOffset jetzt, CancellationToken ct);
}
