using Coin.Domain.Vorlagen;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coin.Infrastructure.Persistenz;

internal sealed class ZertifikatVorlageKonfiguration : IEntityTypeConfiguration<ZertifikatVorlageDatensatz>
{
    public const string IndexCoinVersion = "ux_zertifikat_vorlage_coin_version";

    public void Configure(EntityTypeBuilder<ZertifikatVorlageDatensatz> builder)
    {
        builder.ToTable("zertifikat_vorlage", t =>
        {
            t.HasCheckConstraint("ck_zertifikat_vorlage_version", "version >= 1");
            t.HasCheckConstraint(
                "ck_zertifikat_vorlage_groesse", $"groesse_bytes BETWEEN 1 AND {VorlagenAufbereitung.MaxGroesseBytes}");
        });

        builder.HasKey(v => v.Id);
        builder.Property(v => v.Id).ValueGeneratedNever();
        builder.Property(v => v.Inhalt).IsRequired();
        builder.Property(v => v.Sha256).HasColumnType("char(64)").IsRequired();
        builder.Property(v => v.HochgeladenAm).HasColumnType("timestamp with time zone").IsRequired();

        builder.HasOne<CoinTypDatensatz>().WithMany().HasForeignKey(v => v.CoinId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(v => v.Hochladender).WithMany().HasForeignKey(v => v.HochgeladenVon).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(v => new { v.CoinId, v.Version }).IsUnique().HasDatabaseName(IndexCoinVersion);
        builder.HasIndex(v => v.HochgeladenVon).HasDatabaseName("ix_zertifikat_vorlage_hochgeladen_von");
    }
}

internal sealed class VorlageAuditKonfiguration : IEntityTypeConfiguration<VorlageAuditDatensatz>
{
    public void Configure(EntityTypeBuilder<VorlageAuditDatensatz> builder)
    {
        builder.ToTable("vorlage_audit", t => t.HasCheckConstraint(
            "ck_vorlage_audit_art",
            $"(art = '{VorlageAuditArt.Hochgeladen}' AND version IS NOT NULL AND vorherige_version IS NULL) " +
            $"OR (art = '{VorlageAuditArt.Ersetzt}' AND version IS NOT NULL AND vorherige_version IS NOT NULL) " +
            $"OR (art = '{VorlageAuditArt.Zurueckgesetzt}' AND version IS NULL AND vorherige_version IS NOT NULL)"));

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.Zeitpunkt).HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(a => a.Art).HasMaxLength(15).IsRequired();

        builder.HasOne<BenutzerDatensatz>().WithMany().HasForeignKey(a => a.AkteurId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<CoinTypDatensatz>().WithMany().HasForeignKey(a => a.CoinId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(a => new { a.CoinId, a.Zeitpunkt }).HasDatabaseName("ix_vorlage_audit_coin");
    }
}
