using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <inheritdoc />
    public partial class Startseite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "startseite_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    zeitpunkt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    akteur_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    art = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ziel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    alt = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    neu = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_startseite_audit", x => x.id);
                    table.CheckConstraint("ck_startseite_audit_art", "(art IN ('BlockEingeschaltet', 'BlockAusgeschaltet') AND ziel IN ('kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben') AND alt IS NULL AND neu IS NULL) OR (art = 'ReihenfolgeGeaendert' AND ziel IS NULL AND alt IS NOT NULL AND neu IS NOT NULL) OR (art IN ('TitelGeaendert', 'UntertitelGeaendert', 'InfotextGeaendert') AND ziel IS NULL AND alt IS NULL AND neu IS NULL) OR (art = 'AnzahlGeaendert' AND ziel IN ('neueste', 'meistausgegeben') AND alt IS NOT NULL AND neu IS NOT NULL) OR (art = 'LogoHochgeladen' AND ziel IN ('bereitsteller', 'software') AND alt IS NULL AND neu IS NOT NULL) OR (art = 'LogoErsetzt' AND ziel IN ('bereitsteller', 'software') AND alt IS NOT NULL AND neu IS NOT NULL) OR (art = 'LogoEntfernt' AND ziel IN ('bereitsteller', 'software') AND alt IS NOT NULL AND neu IS NULL) OR (art = 'AlternativtextGeaendert' AND ziel IN ('bereitsteller', 'software') AND alt IS NULL AND neu IS NULL)");
                    table.CheckConstraint("ck_startseite_audit_version", "version >= 1");
                    table.ForeignKey(
                        name: "fk_startseite_audit_benutzer_akteur_id",
                        column: x => x.akteur_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "startseite_konfiguration",
                columns: table => new
                {
                    id = table.Column<short>(type: "smallint", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    reihenfolge = table.Column<string[]>(type: "varchar(20)[]", nullable: false),
                    kopf_aktiv = table.Column<bool>(type: "boolean", nullable: false),
                    infotext_aktiv = table.Column<bool>(type: "boolean", nullable: false),
                    kennzahlen_aktiv = table.Column<bool>(type: "boolean", nullable: false),
                    neueste_aktiv = table.Column<bool>(type: "boolean", nullable: false),
                    meistausgegeben_aktiv = table.Column<bool>(type: "boolean", nullable: false),
                    kopf_titel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    kopf_untertitel = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    infotext = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    neueste_anzahl = table.Column<short>(type: "smallint", nullable: false),
                    meistausgegeben_anzahl = table.Column<short>(type: "smallint", nullable: false),
                    geaendert_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    geaendert_von = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_startseite_konfiguration", x => x.id);
                    table.CheckConstraint("ck_startseite_konfiguration_id", "id = 1");
                    table.CheckConstraint("ck_startseite_konfiguration_infotext", "NOT infotext_aktiv OR btrim(infotext) <> ''");
                    table.CheckConstraint("ck_startseite_konfiguration_kopf_titel", "NOT kopf_aktiv OR btrim(kopf_titel) <> ''");
                    table.CheckConstraint("ck_startseite_konfiguration_meistausgegeben_anzahl", "meistausgegeben_anzahl BETWEEN 3 AND 10");
                    table.CheckConstraint("ck_startseite_konfiguration_neueste_anzahl", "neueste_anzahl BETWEEN 3 AND 12");
                    table.CheckConstraint("ck_startseite_konfiguration_reihenfolge", "cardinality(reihenfolge) = 5 AND reihenfolge::text[] @> ARRAY['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben']::text[]");
                    table.CheckConstraint("ck_startseite_konfiguration_version", "version >= 1");
                    table.ForeignKey(
                        name: "fk_startseite_konfiguration_benutzer_geaendert_von",
                        column: x => x.geaendert_von,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "startseite_logo",
                columns: table => new
                {
                    platz = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    inhalt = table.Column<byte[]>(type: "bytea", nullable: false),
                    format = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    groesse_bytes = table.Column<int>(type: "integer", nullable: false),
                    breite = table.Column<int>(type: "integer", nullable: false),
                    hoehe = table.Column<int>(type: "integer", nullable: false),
                    sha256 = table.Column<string>(type: "char(64)", nullable: false),
                    alternativtext = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    hochgeladen_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    hochgeladen_von = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_startseite_logo", x => x.platz);
                    table.CheckConstraint("ck_startseite_logo_alternativtext", "btrim(alternativtext) <> ''");
                    table.CheckConstraint("ck_startseite_logo_breite", "breite BETWEEN 1 AND 2048");
                    table.CheckConstraint("ck_startseite_logo_format", "format IN ('png', 'jpeg', 'webp')");
                    table.CheckConstraint("ck_startseite_logo_groesse_bytes", "groesse_bytes BETWEEN 1 AND 2097152");
                    table.CheckConstraint("ck_startseite_logo_hoehe", "hoehe BETWEEN 1 AND 2048");
                    table.CheckConstraint("ck_startseite_logo_platz", "platz IN ('bereitsteller', 'software')");
                    table.ForeignKey(
                        name: "fk_startseite_logo_benutzer_hochgeladen_von",
                        column: x => x.hochgeladen_von,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_coin_typ_erstellt",
                table: "coin_typ",
                columns: new[] { "erstellt_am", "id" },
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "ix_startseite_audit_akteur_id",
                table: "startseite_audit",
                column: "akteur_id");

            migrationBuilder.CreateIndex(
                name: "ix_startseite_audit_zeitpunkt",
                table: "startseite_audit",
                column: "zeitpunkt");

            migrationBuilder.CreateIndex(
                name: "ix_startseite_konfiguration_geaendert_von",
                table: "startseite_konfiguration",
                column: "geaendert_von");

            migrationBuilder.CreateIndex(
                name: "ix_startseite_logo_hochgeladen_von",
                table: "startseite_logo",
                column: "hochgeladen_von");

            // Audit-Einträge sind unveränderlich (startseite Abschnitt 4.3, ADR-0030 Punkt 7). TRUNCATE bleibt möglich.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION startseite_audit_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'startseite_audit ist unveränderlich';
                END
                $$;
                """);
            migrationBuilder.Sql(
                """
                CREATE TRIGGER trg_startseite_audit_unveraenderlich
                    BEFORE UPDATE OR DELETE ON startseite_audit
                    FOR EACH ROW EXECUTE FUNCTION startseite_audit_unveraenderlich();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_startseite_audit_unveraenderlich ON startseite_audit;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS startseite_audit_unveraenderlich();");

            migrationBuilder.DropTable(
                name: "startseite_audit");

            migrationBuilder.DropTable(
                name: "startseite_konfiguration");

            migrationBuilder.DropTable(
                name: "startseite_logo");

            migrationBuilder.DropIndex(
                name: "ix_coin_typ_erstellt",
                table: "coin_typ");
        }
    }
}
