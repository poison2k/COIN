using Coin.Domain.Vorlagen;

namespace Coin.Api.Contracts;

/// <summary>Vorlagenstatus eines Coins (zertifikatsvorlagen Abschnitt 5.3). Nur mit <c>coins.write</c>.</summary>
public sealed record VorlagenStatusResponse(string Quelle, int? AktiveVersion, IReadOnlyList<VorlagenVersionResponse> Versionen)
{
    public static VorlagenStatusResponse Aus(VorlagenStatus status)
    {
        ArgumentNullException.ThrowIfNull(status);
        return new VorlagenStatusResponse(
            status.IstStandard ? "standard" : "eigene",
            status.AktiveVersion,
            [.. status.Versionen.Select(v => new VorlagenVersionResponse(
                v.Version,
                v.GroesseBytes,
                v.HochgeladenAm,
                new AkteurResponse(v.HochgeladenVon.Id, v.HochgeladenVon.Name),
                v.Version == status.AktiveVersion))]);
    }
}

/// <summary>Eine Version der Zertifikatsvorlage; <see cref="GroesseBytes"/> bezieht sich auf die bereinigte Fassung.</summary>
public sealed record VorlagenVersionResponse(
    int Version, int GroesseBytes, DateTimeOffset HochgeladenAm, AkteurResponse HochgeladenVon, bool Aktiv);
