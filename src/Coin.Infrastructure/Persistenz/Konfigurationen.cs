using Coin.Domain.Katalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Coin.Infrastructure.Persistenz;

internal sealed class CoinTypKonfiguration : IEntityTypeConfiguration<CoinTypDatensatz>
{
    public void Configure(EntityTypeBuilder<CoinTypDatensatz> builder)
    {
        builder.ToTable("coin_typ", t => t.HasCheckConstraint(
            "ck_coin_typ_auflage",
            $"auflage IS NULL OR auflage BETWEEN {CoinTyp.AuflageMin} AND {CoinTyp.AuflageMax}"));

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.Name).HasMaxLength(CoinTyp.NameMaxLaenge).IsRequired();
        builder.Property(c => c.Herausgeber).HasMaxLength(CoinTyp.HerausgeberMaxLaenge).IsRequired();
        builder.Property(c => c.Beschreibung).HasMaxLength(CoinTyp.BeschreibungMaxLaenge);
        builder.Property(c => c.ErstelltAm).HasColumnType("timestamp with time zone").IsRequired();

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
