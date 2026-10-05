namespace Coin.Api.Authentifizierung;

/// <summary>
/// CORS nur für genau einen Ursprung aus <c>Frontend:Ursprung</c>, ohne Credentials (AK-12).
/// Ohne Einstellung werden keine CORS-Header gesendet.
/// </summary>
public static class FrontendUrsprung
{
    public const string Schluessel = "Frontend:Ursprung";

    /// <summary>Liest den Ursprung; <c>null</c>, wenn nicht gesetzt. Wirft bei <c>*</c>, Pfad oder ungültigem Wert.</summary>
    public static string? Lesen(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var wert = configuration[Schluessel]?.Trim();
        if (string.IsNullOrEmpty(wert))
        {
            return null;
        }

        // Ein Ursprung ist genau Schema://Host[:Port], ohne Pfad (auch kein „/“), Query oder Platzhalter.
        if (!Uri.TryCreate(wert, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
            || !string.Equals(uri.GetLeftPart(UriPartial.Authority), wert, StringComparison.OrdinalIgnoreCase)
            || !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new InvalidOperationException(
                $"Die Einstellung '{Schluessel}' muss genau ein Ursprung der Form http(s)://host[:port] sein " +
                "(ohne Pfad, ohne abschließenden Schrägstrich, kein '*').");
        }

        return wert;
    }
}
