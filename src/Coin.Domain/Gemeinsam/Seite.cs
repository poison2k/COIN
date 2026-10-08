namespace Coin.Domain.Gemeinsam;

/// <summary>Eine Seite einer Liste. <see cref="Nummer"/> beginnt bei 1.</summary>
public sealed record Seite<T>(IReadOnlyList<T> Eintraege, int Gesamt, int Nummer, int Groesse);
