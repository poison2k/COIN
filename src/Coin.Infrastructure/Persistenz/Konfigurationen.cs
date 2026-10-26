using Coin.Domain.Benutzer;
using Coin.Domain.Katalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coin.Infrastructure.Persistenz;

internal sealed class CoinTypKonfiguration : IEntityTypeConfiguration<CoinTypDatensatz>
{
    /// <summary>Eindeutiger Index der Kennung (zertifikat-erzeugen AK-1).</summary>
    public const string IndexKennung = "ux_coin_typ_kennung";

    /// <summary>Funktion für den Spalten-Default; vergibt die Kennung aus <c>coin_kennung_seq</c> (ADR-0027 Punkt 2).</summary>
    public const string KennungFunktion = "coin_kennung_neu()";

    public void Configure(EntityTypeBuilder<CoinTypDatensatz> builder)
    {
        builder.ToTable("coin_typ", t =>
        {
            t.HasCheckConstraint(
                "ck_coin_typ_auflage",
                $"auflage IS NULL OR auflage BETWEEN {CoinTyp.AuflageMin} AND {CoinTyp.AuflageMax}");
            t.HasCheckConstraint("ck_coin_typ_kennung", "kennung ~ '^C[0-9]{4,}$'");
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.Name).HasMaxLength(CoinTyp.NameMaxLaenge).IsRequired();
        builder.Property(c => c.Herausgeber).HasMaxLength(CoinTyp.HerausgeberMaxLaenge).IsRequired();
        builder.Property(c => c.Beschreibung).HasMaxLength(CoinTyp.BeschreibungMaxLaenge);
        builder.Property(c => c.ErstelltAm).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(c => c.Kennung).HasMaxLength(CoinKennung.MaxLaenge).IsRequired().HasDefaultValueSql(KennungFunktion);
        builder.HasIndex(c => c.Kennung).IsUnique().HasDatabaseName(IndexKennung);

        // „Neueste Coins“ der Startseite (startseite Abschnitt 4.4, 6): ORDER BY erstellt_am DESC, id DESC LIMIT n.
        builder.HasIndex(c => new { c.ErstelltAm, c.Id }).IsDescending(true, true).HasDatabaseName("ix_coin_typ_erstellt");

        // Eindeutiger Index auf (lower(name), lower(herausgeber)) wird in der Migration per SQL angelegt.
        builder.HasOne(c => c.Bild)
            .WithOne()
            .HasForeignKey<CoinBildDatensatz>(b => b.CoinId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class CoinBildKonfiguration : IEntityTypeConfiguration<CoinBildDatensatz>
{
    public void Configure(EntityTypeBuilder<CoinBildDatensatz> builder)
    {
        builder.ToTable("coin_bild", t => t.HasCheckConstraint(
            "ck_coin_bild_groesse_bytes",
            $"groesse_bytes BETWEEN 1 AND {CoinBild.MaxGroesseBytes}"));

        builder.HasKey(b => b.CoinId);
        builder.Property(b => b.CoinId).ValueGeneratedNever();
        builder.Property(b => b.Inhalt).HasColumnType("bytea").IsRequired();
        builder.Property(b => b.Format).HasMaxLength(10).IsRequired();
        builder.Property(b => b.Sha256).HasColumnType("char(64)").IsRequired();
        builder.Property(b => b.GroesseBytes).IsRequired();
        builder.Property(b => b.HochgeladenAm).HasColumnType("timestamp with time zone").IsRequired();
    }
}

internal sealed class BenutzerKonfiguration : IEntityTypeConfiguration<BenutzerDatensatz>
{
    public const int MaxRolleLaenge = 20;

    public void Configure(EntityTypeBuilder<BenutzerDatensatz> builder)
    {
        var rollen = string.Join(", ", Enum.GetNames<Rolle>().Select(r => $"'{r}'"));
        builder.ToTable("benutzer", t => t.HasCheckConstraint("ck_benutzer_rolle", $"rolle IS NULL OR rolle IN ({rollen})"));

        builder.HasKey(b => b.Id);
        builder.Property(b => b.Id).ValueGeneratedNever();
        builder.Property(b => b.Issuer).HasMaxLength(BenutzerIdentitaet.MaxIssuerLaenge).IsRequired();
        builder.Property(b => b.Subject).HasMaxLength(BenutzerIdentitaet.MaxSubjectLaenge).IsRequired();
        builder.Property(b => b.Email).HasMaxLength(BenutzerIdentitaet.MaxEmailLaenge);
        builder.Property(b => b.Anzeigename).HasMaxLength(BenutzerIdentitaet.MaxAnzeigenameLaenge).IsRequired();
        builder.Property(b => b.Rolle).HasMaxLength(MaxRolleLaenge);
        // Sentinel true: EF lässt den Wert beim Einfügen nur bei true weg (dann greift der DB-Standard true).
        builder.Property(b => b.Aktiv).HasDefaultValue(true).HasSentinel(true).IsRequired();
        builder.Property(b => b.ErstelltAm).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(b => b.AktualisiertAm).HasColumnType("timestamp with time zone").IsRequired();

        builder.HasIndex(b => new { b.Issuer, b.Subject }).IsUnique().HasDatabaseName("ux_benutzer_issuer_subject");
    }
}

internal sealed class BenutzerAuditKonfiguration : IEntityTypeConfiguration<BenutzerAuditDatensatz>
{
    public const int MaxArtLaenge = 10;
    public const int MaxWertLaenge = 20;

    public void Configure(EntityTypeBuilder<BenutzerAuditDatensatz> builder)
    {
        var rollenwerte = Liste(Enum.GetNames<Rolle>().Append(RolleText.Keine));
        var statuswerte = Liste([AuditEintrag.Aktiv, AuditEintrag.Deaktiviert]);
        builder.ToTable("benutzer_audit", t => t.HasCheckConstraint(
            "ck_benutzer_audit_werte",
            $"((art = '{AuditArt.Rolle}' AND alt IN ({rollenwerte}) AND neu IN ({rollenwerte})) " +
            $"OR (art = '{AuditArt.Status}' AND alt IN ({statuswerte}) AND neu IN ({statuswerte}))) " +
            "AND alt <> neu"));

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.Zeitpunkt).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(a => a.Art).HasMaxLength(MaxArtLaenge).IsRequired();
        builder.Property(a => a.Alt).HasMaxLength(MaxWertLaenge).IsRequired();
        builder.Property(a => a.Neu).HasMaxLength(MaxWertLaenge).IsRequired();

        builder.HasOne(a => a.Akteur).WithMany().HasForeignKey(a => a.AkteurId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.Benutzer).WithMany().HasForeignKey(a => a.BenutzerId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(a => new { a.Zeitpunkt, a.Id }).IsDescending(true, true).HasDatabaseName("ix_benutzer_audit_zeitpunkt");
        builder.HasIndex(a => new { a.BenutzerId, a.Zeitpunkt }).IsDescending(false, true).HasDatabaseName("ix_benutzer_audit_benutzer");
    }

    private static string Liste(IEnumerable<string> werte) => string.Join(", ", werte.Select(w => $"'{w}'"));
}
