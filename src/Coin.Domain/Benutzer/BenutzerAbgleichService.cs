namespace Coin.Domain.Benutzer;

/// <summary>Gleicht den angemeldeten Benutzer mit der eigenen Datenbank ab (AK-13 bis AK-16).</summary>
public sealed class BenutzerAbgleichService(IBenutzerRepository repository, BootstrapAdmins bootstrap, TimeProvider zeit)
{
    public Task<Benutzer> AbgleichenAsync(BenutzerIdentitaet identitaet, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(identitaet);

        return repository.AbgleichenAsync(identitaet, bootstrap.RolleBeiNeuanlage(identitaet), Jetzt(), ct);
    }

    /// <summary>UTC, auf Mikrosekunden gekürzt (Auflösung von PostgreSQL <c>timestamptz</c>).</summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow().ToUniversalTime();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
