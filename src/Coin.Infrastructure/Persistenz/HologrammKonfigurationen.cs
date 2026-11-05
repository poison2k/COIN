using Coin.Domain.Ausgaben;
using Coin.Domain.Pruefung;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coin.Infrastructure.Persistenz;

internal sealed class AusgabeHologrammKonfiguration : IEntityTypeConfiguration<AusgabeHologrammDatensatz>
{
    public const string IndexAktuell = "ux_ausgabe_hologramm_aktuell";
    public const string IndexNummer = "ux_ausgabe_hologramm_nummer";
    public const string IndexAusgabe = "ix_ausgabe_hologramm_ausgabe";

    public void Configure(EntityTypeBuilder<AusgabeHologrammDatensatz> builder)
    {
        builder.ToTable("ausgabe_hologramm", t =>
        {
            t.HasCheckConstraint(
                "ck_ausgabe_hologramm_nummer",
                $"nummer ~ '^[A-Z0-9 -]{{1,{Hologrammnummer.MaxLaenge}}}$' AND nummer = btrim(nummer) AND position('  ' IN nummer) = 0");
            t.HasCheckConstraint(
                "ck_ausgabe_hologramm_nummer_normalisiert",
                $"nummer_normalisiert ~ '^[A-Z0-9]{{1,{Hologrammnummer.MaxLaenge}}}$'");
        });

        builder.HasKey(h => h.Id);
        builder.Property(h => h.Id).ValueGeneratedNever();
        builder.Property(h => h.Nummer).HasMaxLength(Hologrammnummer.MaxLaenge).IsRequired();
        builder.Property(h => h.NummerNormalisiert)
            .HasMaxLength(Hologrammnummer.MaxLaenge)
            .HasComputedColumnSql("upper(translate(nummer, ' -', ''))", stored: true);
        builder.Property(h => h.GesetztAm).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(h => h.AbgeloestAm).HasColumnType("timestamp with time zone");

        builder.HasOne<AusgabeDatensatz>()
            .WithMany()
            .HasForeignKey(h => h.AusgabeId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_ausgabe_hologramm_ausgabe_ausgabe_id");
        builder.HasOne<BenutzerDatensatz>()
            .WithMany()
            .HasForeignKey(h => h.GesetztVon)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_ausgabe_hologramm_benutzer_gesetzt_von");

        // Eine aktuelle Nummer je Ausgabe; eindeutig über alle Coins nur unter nicht abgelösten Zeilen (H1, ADR-0033 Punkt 1).
        builder.HasIndex(h => h.AusgabeId, IndexAktuell)
            .IsUnique()
            .HasFilter("abgeloest_am IS NULL")
            .HasDatabaseName(IndexAktuell);
        builder.HasIndex(h => h.NummerNormalisiert, IndexNummer)
            .IsUnique()
            .HasFilter("abgeloest_am IS NULL")
            .HasDatabaseName(IndexNummer);
        builder.HasIndex(h => h.AusgabeId, IndexAusgabe).HasDatabaseName(IndexAusgabe);
    }
}

internal sealed class HologrammAuditKonfiguration : IEntityTypeConfiguration<HologrammAuditDatensatz>
{
    public const string Gesetzt = "Gesetzt";
    public const string Geaendert = "Geaendert";

    public void Configure(EntityTypeBuilder<HologrammAuditDatensatz> builder)
    {
        builder.ToTable("hologramm_audit", t => t.HasCheckConstraint(
            "ck_hologramm_audit_art",
            $"(art = '{Gesetzt}' AND nummer_alt IS NULL AND grund IS NULL) " +
            $"OR (art = '{Geaendert}' AND nummer_alt IS NOT NULL AND grund IS NOT NULL)"));

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.Zeitpunkt).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(a => a.Art).HasMaxLength(10).IsRequired();
        builder.Property(a => a.NummerAlt).HasMaxLength(Hologrammnummer.MaxLaenge);
        builder.Property(a => a.NummerNeu).HasMaxLength(Hologrammnummer.MaxLaenge).IsRequired();
        builder.Property(a => a.Grund).HasMaxLength(Ausgabe.StornoGrundMaxLaenge);

        builder.HasOne<BenutzerDatensatz>()
            .WithMany()
            .HasForeignKey(a => a.AkteurId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_hologramm_audit_benutzer_akteur_id");
        builder.HasOne<AusgabeDatensatz>()
            .WithMany()
            .HasForeignKey(a => a.AusgabeId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_hologramm_audit_ausgabe_ausgabe_id");
        builder.HasIndex(a => a.AusgabeId).HasDatabaseName("ix_hologramm_audit_ausgabe");
        builder.HasIndex(a => a.AkteurId).HasDatabaseName("ix_hologramm_audit_akteur_id");
    }
}

internal sealed class PruefungAuditKonfiguration : IEntityTypeConfiguration<PruefungAuditDatensatz>
{
    public void Configure(EntityTypeBuilder<PruefungAuditDatensatz> builder)
    {
        var ergebnisse = string.Join(", ", Enum.GetNames<PruefErgebnisArt>().Select(n => $"'{n}'"));
        builder.ToTable("pruefung_audit", t =>
        {
            t.HasCheckConstraint("ck_pruefung_audit_ergebnis", $"ergebnis IN ({ergebnisse})");
            t.HasCheckConstraint(
                "ck_pruefung_audit_ausgabe",
                $"(ergebnis = '{nameof(PruefErgebnisArt.NichtGefunden)}') = (ausgabe_id IS NULL)");
        });

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.Zeitpunkt).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(a => a.Nummer).HasMaxLength(Hologrammnummer.MaxLaenge).IsRequired();
        builder.Property(a => a.Ergebnis).HasMaxLength(15).IsRequired();

        builder.HasOne<BenutzerDatensatz>()
            .WithMany()
            .HasForeignKey(a => a.AkteurId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_pruefung_audit_benutzer_akteur_id");
        builder.HasOne<AusgabeDatensatz>()
            .WithMany()
            .HasForeignKey(a => a.AusgabeId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_pruefung_audit_ausgabe_ausgabe_id");
        builder.HasIndex(a => a.AkteurId).HasDatabaseName("ix_pruefung_audit_akteur");
        builder.HasIndex(a => a.Zeitpunkt).HasDatabaseName("ix_pruefung_audit_zeitpunkt");
        builder.HasIndex(a => a.AusgabeId).HasDatabaseName("ix_pruefung_audit_ausgabe");
    }
}
