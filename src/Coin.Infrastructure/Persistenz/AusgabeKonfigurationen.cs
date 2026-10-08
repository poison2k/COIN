using Coin.Domain.Ausgaben;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coin.Infrastructure.Persistenz;

internal sealed class ExemplarKonfiguration : IEntityTypeConfiguration<ExemplarDatensatz>
{
    public void Configure(EntityTypeBuilder<ExemplarDatensatz> builder)
    {
        builder.ToTable("exemplar", t => t.HasCheckConstraint("ck_exemplar_nummer", "nummer >= 1"));

        builder.HasKey(e => new { e.CoinId, e.Nummer });
        builder.Property(e => e.Nummer).ValueGeneratedNever();
        builder.HasOne<CoinTypDatensatz>().WithMany().HasForeignKey(e => e.CoinId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AusgabeKonfiguration : IEntityTypeConfiguration<AusgabeDatensatz>
{
    public const string IndexAktiv = "ux_ausgabe_exemplar_aktiv";
    public const string IndexExemplar = "ix_ausgabe_exemplar";

    public void Configure(EntityTypeBuilder<AusgabeDatensatz> builder)
    {
        builder.ToTable("ausgabe", t => t.HasCheckConstraint(
            "ck_ausgabe_storno",
            "(storniert_am IS NULL AND storniert_von IS NULL AND storno_grund IS NULL) " +
            "OR (storniert_am IS NOT NULL AND storniert_von IS NOT NULL AND storno_grund IS NOT NULL)"));

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.EmpfaengerName).HasMaxLength(AusgabeAngaben.EmpfaengerNameMaxLaenge).IsRequired();
        builder.Property(a => a.EmpfaengerDienstgrad).HasMaxLength(AusgabeAngaben.EmpfaengerDienstgradMaxLaenge);
        builder.Property(a => a.EmpfaengerDienststelle).HasMaxLength(AusgabeAngaben.EmpfaengerDienststelleMaxLaenge);
        builder.Property(a => a.Datum).HasColumnType("date").IsRequired();
        builder.Property(a => a.Gelegenheit).HasMaxLength(AusgabeAngaben.GelegenheitMaxLaenge).IsRequired();
        builder.Property(a => a.Begruendung).HasMaxLength(AusgabeAngaben.BegruendungMaxLaenge).IsRequired();
        builder.Property(a => a.AusgebendeStelle).HasMaxLength(AusgabeAngaben.AusgebendeStelleMaxLaenge).IsRequired();
        builder.Property(a => a.ErfasstAm).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(a => a.StorniertAm).HasColumnType("timestamp with time zone");
        builder.Property(a => a.StornoGrund).HasMaxLength(Ausgabe.StornoGrundMaxLaenge);

        builder.HasOne<ExemplarDatensatz>()
            .WithMany()
            .HasForeignKey(a => new { a.CoinId, a.ExemplarNummer })
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.Erfasser).WithMany().HasForeignKey(a => a.ErfasstVon).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.Stornierer).WithMany().HasForeignKey(a => a.StorniertVon).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(a => new { a.CoinId, a.ExemplarNummer }, IndexAktiv)
            .IsUnique()
            .HasFilter("storniert_am IS NULL")
            .HasDatabaseName(IndexAktiv);

        // Nicht partiell: stützt den Fremdschlüssel-Check beim Löschen von Exemplaren (Auflage senken), der auch
        // stornierte Ausgaben berücksichtigen muss, und die höchste je ausgegebene Nummer (ADR-0020).
        builder.HasIndex(a => new { a.CoinId, a.ExemplarNummer }, IndexExemplar).HasDatabaseName(IndexExemplar);
        builder.HasIndex(a => new { a.CoinId, a.ErfasstAm, a.Id })
            .IsDescending(false, true, true)
            .HasDatabaseName("ix_ausgabe_coin_erfasst");
    }
}

internal sealed class AusgabeAuditKonfiguration : IEntityTypeConfiguration<AusgabeAuditDatensatz>
{
    public const string Erfasst = "Erfasst";
    public const string Storniert = "Storniert";

    public void Configure(EntityTypeBuilder<AusgabeAuditDatensatz> builder)
    {
        builder.ToTable("ausgabe_audit", t => t.HasCheckConstraint(
            "ck_ausgabe_audit_art",
            $"(art = '{Erfasst}' AND grund IS NULL) OR (art = '{Storniert}' AND grund IS NOT NULL)"));

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.Zeitpunkt).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(a => a.Art).HasMaxLength(10).IsRequired();
        builder.Property(a => a.Grund).HasMaxLength(Ausgabe.StornoGrundMaxLaenge);

        builder.HasOne<BenutzerDatensatz>().WithMany().HasForeignKey(a => a.AkteurId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AusgabeDatensatz>()
            .WithMany()
            .HasForeignKey(a => a.AusgabeId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_ausgabe_audit_ausgabe_ausgabe_id");
        builder.HasIndex(a => a.AusgabeId).HasDatabaseName("ix_ausgabe_audit_ausgabe");
    }
}
