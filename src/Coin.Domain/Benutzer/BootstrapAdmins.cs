namespace Coin.Domain.Benutzer;

/// <summary>
/// Bootstrap der ersten Administratoren (AK-16): Nur beim Anlegen, nur bei verifizierter E-Mail und nur, wenn die
/// E-Mail (getrimmt, ohne Beachtung der Groß-/Kleinschreibung) exakt in der Liste steht.
/// </summary>
public sealed class BootstrapAdmins
{
    private readonly HashSet<string> _emails;

    public BootstrapAdmins(IEnumerable<string>? emails)
    {
        _emails = new HashSet<string>(
            (emails ?? []).Select(e => e?.Trim()).Where(e => !string.IsNullOrEmpty(e))!,
            StringComparer.OrdinalIgnoreCase);
    }

    public Rolle? RolleBeiNeuanlage(BenutzerIdentitaet identitaet)
    {
        ArgumentNullException.ThrowIfNull(identitaet);

        if (!identitaet.EmailVerifiziert || identitaet.Email?.Trim() is not { Length: > 0 } email)
        {
            return null;
        }

        return _emails.Contains(email) ? Rolle.Administrator : null;
    }
}
