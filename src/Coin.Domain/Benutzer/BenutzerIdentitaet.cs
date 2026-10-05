namespace Coin.Domain.Benutzer;

/// <summary>
/// Identität eines angemeldeten Benutzers aus den Claims eines geprüften Tokens (ADR-0013).
/// Fachlicher Schlüssel ist (<see cref="Issuer"/>, <see cref="Subject"/>).
/// </summary>
public sealed record BenutzerIdentitaet
{
    public const int MaxAnzeigenameLaenge = 200;
    public const int MaxEmailLaenge = 320;
    public const int MaxIssuerLaenge = 500;
    public const int MaxSubjectLaenge = 255;
    public const string UnbekannterName = "Unbekannt";

    private BenutzerIdentitaet(string issuer, string subject, string? email, bool emailVerifiziert, string anzeigename)
    {
        Issuer = issuer;
        Subject = subject;
        Email = email;
        EmailVerifiziert = emailVerifiziert;
        Anzeigename = anzeigename;
    }

    public string Issuer { get; }

    public string Subject { get; }

    /// <summary>E-Mail aus dem Token; <c>null</c>, wenn sie fehlt oder länger als <see cref="MaxEmailLaenge"/> ist.</summary>
    public string? Email { get; }

    public bool EmailVerifiziert { get; }

    /// <summary><c>name</c>, sonst <c>preferred_username</c>, sonst E-Mail, sonst „Unbekannt“; höchstens 200 Zeichen.</summary>
    public string Anzeigename { get; }

    public static BenutzerIdentitaet Erstellen(
        string issuer,
        string subject,
        string? email,
        bool emailVerifiziert,
        string? name,
        string? preferredUsername)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(issuer);
        ArgumentException.ThrowIfNullOrWhiteSpace(subject);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(issuer.Length, MaxIssuerLaenge, nameof(issuer));
        ArgumentOutOfRangeException.ThrowIfGreaterThan(subject.Length, MaxSubjectLaenge, nameof(subject));

        var gueltigeEmail = !string.IsNullOrWhiteSpace(email) && email.Length <= MaxEmailLaenge ? email : null;
        var anzeigename = new[] { name, preferredUsername, gueltigeEmail }
            .FirstOrDefault(w => !string.IsNullOrWhiteSpace(w)) ?? UnbekannterName;
        if (anzeigename.Length > MaxAnzeigenameLaenge)
        {
            // Kein halbes Surrogatpaar am Ende (gültiges UTF-16).
            var laenge = char.IsHighSurrogate(anzeigename[MaxAnzeigenameLaenge - 1]) ? MaxAnzeigenameLaenge - 1 : MaxAnzeigenameLaenge;
            anzeigename = anzeigename[..laenge];
        }

        return new BenutzerIdentitaet(issuer, subject, gueltigeEmail, emailVerifiziert, anzeigename);
    }
}
