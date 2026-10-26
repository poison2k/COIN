using Coin.Domain.Startseite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coin.Infrastructure.Persistenz;

internal static class StartseiteSql
{
    public static string Liste(IEnumerable<string> werte) => string.Join(", ", werte.Select(w => $"'{w}'"));

    public static string Bloecke => Liste(StartseiteNamen.AlleBloecke.Select(b => b.Name()));

    public static string Plaetze => Liste(StartseiteNamen.AllePlaetze.Select(p => p.Name()));
}

internal sealed class StartseiteKonfigurationKonfiguration : IEntityTypeConfiguration<StartseiteKonfigurationDatensatz>
{
    public void Configure(EntityTypeBuilder<StartseiteKonfigurationDatensatz> builder)
    {
        builder.ToTable("startseite_konfiguration", t =>
        {
            t.HasCheckConstraint("ck_startseite_konfiguration_id", "id = 1");
            t.HasCheckConstraint("ck_startseite_konfiguration_version", "version >= 1");
            t.HasCheckConstraint(
                "ck_startseite_konfiguration_reihenfolge",
                $"cardinality(reihenfolge) = 5 AND reihenfolge::text[] @> ARRAY[{StartseiteSql.Bloecke}]::text[]");
            t.HasCheckConstraint("ck_startseite_konfiguration_kopf_titel", "NOT kopf_aktiv OR btrim(kopf_titel) <> ''");
            t.HasCheckConstraint("ck_startseite_konfiguration_infotext", "NOT infotext_aktiv OR btrim(infotext) <> ''");
            t.HasCheckConstraint(
                "ck_startseite_konfiguration_neueste_anzahl",
                $"neueste_anzahl BETWEEN {StartseiteKonfiguration.NeuesteMin} AND {StartseiteKonfiguration.NeuesteMax}");
            t.HasCheckConstraint(
                "ck_startseite_konfiguration_meistausgegeben_anzahl",
                $"meistausgegeben_anzahl BETWEEN {StartseiteKonfiguration.MeistausgegebeneMin} AND {StartseiteKonfiguration.MeistausgegebeneMax}");
        });

        builder.HasKey(k => k.Id);
        builder.Property(k => k.Id).ValueGeneratedNever();
        builder.Property(k => k.Reihenfolge).HasColumnType("varchar(20)[]").IsRequired();
        builder.Property(k => k.KopfTitel).HasMaxLength(StartseiteKonfiguration.TitelMax).IsRequired();
        builder.Property(k => k.KopfUntertitel).HasMaxLength(StartseiteKonfiguration.UntertitelMax).IsRequired();
        builder.Property(k => k.Infotext).HasMaxLength(StartseiteKonfiguration.InfotextMax).IsRequired();
        builder.Property(k => k.GeaendertAm).HasColumnType("timestamp with time zone").IsRequired();

        builder.HasOne<BenutzerDatensatz>().WithMany().HasForeignKey(k => k.GeaendertVon).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class StartseiteLogoKonfiguration : IEntityTypeConfiguration<StartseiteLogoDatensatz>
{
    public void Configure(EntityTypeBuilder<StartseiteLogoDatensatz> builder)
    {
        builder.ToTable("startseite_logo", t =>
        {
            t.HasCheckConstraint("ck_startseite_logo_platz", $"platz IN ({StartseiteSql.Plaetze})");
            t.HasCheckConstraint("ck_startseite_logo_format", "format IN ('png', 'jpeg', 'webp')");
            t.HasCheckConstraint("ck_startseite_logo_groesse_bytes", $"groesse_bytes BETWEEN 1 AND {LogoPruefung.MaxGroesseBytes}");
            t.HasCheckConstraint("ck_startseite_logo_breite", $"breite BETWEEN 1 AND {LogoPruefung.MaxPixel}");
            t.HasCheckConstraint("ck_startseite_logo_hoehe", $"hoehe BETWEEN 1 AND {LogoPruefung.MaxPixel}");
            t.HasCheckConstraint("ck_startseite_logo_alternativtext", "btrim(alternativtext) <> ''");
        });

        builder.HasKey(l => l.Platz);
        builder.Property(l => l.Platz).HasMaxLength(20).ValueGeneratedNever();
        builder.Property(l => l.Inhalt).HasColumnType("bytea").IsRequired();
        builder.Property(l => l.Format).HasMaxLength(10).IsRequired();
        builder.Property(l => l.Sha256).HasColumnType("char(64)").IsRequired();
        builder.Property(l => l.Alternativtext).HasMaxLength(StartseiteKonfiguration.AlternativtextMax).IsRequired();
        builder.Property(l => l.HochgeladenAm).HasColumnType("timestamp with time zone").IsRequired();

        builder.HasOne<BenutzerDatensatz>().WithMany().HasForeignKey(l => l.HochgeladenVon).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class StartseiteAuditKonfiguration : IEntityTypeConfiguration<StartseiteAuditDatensatz>
{
    public void Configure(EntityTypeBuilder<StartseiteAuditDatensatz> builder)
    {
        var bloecke = StartseiteSql.Bloecke;
        var plaetze = StartseiteSql.Plaetze;
        builder.ToTable("startseite_audit", t =>
        {
            t.HasCheckConstraint("ck_startseite_audit_version", "version >= 1");
            t.HasCheckConstraint(
                "ck_startseite_audit_art",
                $"(art IN ('{nameof(StartseiteAenderungsArt.BlockEingeschaltet)}', '{nameof(StartseiteAenderungsArt.BlockAusgeschaltet)}') " +
                $"AND ziel IN ({bloecke}) AND alt IS NULL AND neu IS NULL) " +
                $"OR (art = '{nameof(StartseiteAenderungsArt.ReihenfolgeGeaendert)}' AND ziel IS NULL AND alt IS NOT NULL AND neu IS NOT NULL) " +
                $"OR (art IN ('{nameof(StartseiteAenderungsArt.TitelGeaendert)}', '{nameof(StartseiteAenderungsArt.UntertitelGeaendert)}', " +
                $"'{nameof(StartseiteAenderungsArt.InfotextGeaendert)}') AND ziel IS NULL AND alt IS NULL AND neu IS NULL) " +
                $"OR (art = '{nameof(StartseiteAenderungsArt.AnzahlGeaendert)}' AND ziel IN ('neueste', 'meistausgegeben') " +
                "AND alt IS NOT NULL AND neu IS NOT NULL) " +
                $"OR (art = '{nameof(StartseiteAenderungsArt.LogoHochgeladen)}' AND ziel IN ({plaetze}) AND alt IS NULL AND neu IS NOT NULL) " +
                $"OR (art = '{nameof(StartseiteAenderungsArt.LogoErsetzt)}' AND ziel IN ({plaetze}) AND alt IS NOT NULL AND neu IS NOT NULL) " +
                $"OR (art = '{nameof(StartseiteAenderungsArt.LogoEntfernt)}' AND ziel IN ({plaetze}) AND alt IS NOT NULL AND neu IS NULL) " +
                $"OR (art = '{nameof(StartseiteAenderungsArt.AlternativtextGeaendert)}' AND ziel IN ({plaetze}) AND alt IS NULL AND neu IS NULL)");
        });

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.Zeitpunkt).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(a => a.Art).HasMaxLength(30).IsRequired();
        builder.Property(a => a.Ziel).HasMaxLength(20);
        builder.Property(a => a.Alt).HasMaxLength(64);
        builder.Property(a => a.Neu).HasMaxLength(64);

        builder.HasOne<BenutzerDatensatz>().WithMany().HasForeignKey(a => a.AkteurId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(a => a.Zeitpunkt).HasDatabaseName("ix_startseite_audit_zeitpunkt");
    }
}
