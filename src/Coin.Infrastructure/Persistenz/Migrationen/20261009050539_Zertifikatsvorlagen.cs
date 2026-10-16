using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <inheritdoc />
    public partial class Zertifikatsvorlagen : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "aktive_vorlage_version",
                table: "coin_typ",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "vorlage_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    zeitpunkt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    akteur_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    art = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    version = table.Column<int>(type: "integer", nullable: true),
                    vorherige_version = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vorlage_audit", x => x.id);
                    table.CheckConstraint("ck_vorlage_audit_art", "(art = 'Hochgeladen' AND version IS NOT NULL AND vorherige_version IS NULL) OR (art = 'Ersetzt' AND version IS NOT NULL AND vorherige_version IS NOT NULL) OR (art = 'Zurueckgesetzt' AND version IS NULL AND vorherige_version IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_vorlage_audit_benutzer_akteur_id",
                        column: x => x.akteur_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_vorlage_audit_coin_typ_coin_id",
                        column: x => x.coin_id,
                        principalTable: "coin_typ",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "zertifikat_vorlage",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    inhalt = table.Column<byte[]>(type: "bytea", nullable: false),
                    groesse_bytes = table.Column<int>(type: "integer", nullable: false),
                    sha256 = table.Column<string>(type: "char(64)", nullable: false),
                    hochgeladen_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    hochgeladen_von = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_zertifikat_vorlage", x => x.id);
                    table.CheckConstraint("ck_zertifikat_vorlage_groesse", "groesse_bytes BETWEEN 1 AND 5242880");
                    table.CheckConstraint("ck_zertifikat_vorlage_version", "version >= 1");
                    table.ForeignKey(
                        name: "fk_zertifikat_vorlage_benutzer_hochgeladen_von",
                        column: x => x.hochgeladen_von,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_zertifikat_vorlage_coin_typ_coin_id",
                        column: x => x.coin_id,
                        principalTable: "coin_typ",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_vorlage_audit_akteur_id",
                table: "vorlage_audit",
                column: "akteur_id");

            migrationBuilder.CreateIndex(
                name: "ix_vorlage_audit_coin",
                table: "vorlage_audit",
                columns: new[] { "coin_id", "zeitpunkt" });

            migrationBuilder.CreateIndex(
                name: "ix_zertifikat_vorlage_hochgeladen_von",
                table: "zertifikat_vorlage",
                column: "hochgeladen_von");

            migrationBuilder.CreateIndex(
                name: "ux_zertifikat_vorlage_coin_version",
                table: "zertifikat_vorlage",
                columns: new[] { "coin_id", "version" },
                unique: true);

            // Zeiger auf die aktive Version (ADR-0023 Punkt 3): zusammengesetzter Fremdschlüssel, damit ein Coin nie auf
            // die Version eines anderen Coins zeigt. NULL = Standardvorlage (MATCH SIMPLE).
            migrationBuilder.Sql(
                """
                ALTER TABLE coin_typ ADD CONSTRAINT fk_coin_typ_aktive_vorlage
                    FOREIGN KEY (id, aktive_vorlage_version) REFERENCES zertifikat_vorlage (coin_id, version)
                    ON DELETE RESTRICT;
                """);

            // Versionen und Audit-Einträge sind unveränderlich (ADR-0023 Punkt 2 und 7). TRUNCATE bleibt möglich.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION zertifikat_vorlage_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'zertifikat_vorlage ist unveränderlich';
                END
                $$;
                """);
            migrationBuilder.Sql(
                """
                CREATE TRIGGER trg_zertifikat_vorlage_unveraenderlich
                    BEFORE UPDATE OR DELETE ON zertifikat_vorlage
                    FOR EACH ROW EXECUTE FUNCTION zertifikat_vorlage_unveraenderlich();
                """);
            migrationBuilder.Sql(
                """
                CREATE FUNCTION vorlage_audit_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'vorlage_audit ist unveränderlich';
                END
                $$;
                """);
            migrationBuilder.Sql(
                """
                CREATE TRIGGER trg_vorlage_audit_unveraenderlich
                    BEFORE UPDATE OR DELETE ON vorlage_audit
                    FOR EACH ROW EXECUTE FUNCTION vorlage_audit_unveraenderlich();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_vorlage_audit_unveraenderlich ON vorlage_audit;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS vorlage_audit_unveraenderlich();");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_zertifikat_vorlage_unveraenderlich ON zertifikat_vorlage;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS zertifikat_vorlage_unveraenderlich();");
            migrationBuilder.Sql("ALTER TABLE coin_typ DROP CONSTRAINT IF EXISTS fk_coin_typ_aktive_vorlage;");

            migrationBuilder.DropTable(
                name: "vorlage_audit");

            migrationBuilder.DropTable(
                name: "zertifikat_vorlage");

            migrationBuilder.DropColumn(
                name: "aktive_vorlage_version",
                table: "coin_typ");
        }
    }
}
