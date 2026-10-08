using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <inheritdoc />
    public partial class Exemplare : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "exemplar",
                columns: table => new
                {
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    nummer = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_exemplar", x => new { x.coin_id, x.nummer });
                    table.CheckConstraint("ck_exemplar_nummer", "nummer >= 1");
                    table.ForeignKey(
                        name: "fk_exemplar_coin_typ_coin_id",
                        column: x => x.coin_id,
                        principalTable: "coin_typ",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ausgabe",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exemplar_nummer = table.Column<int>(type: "integer", nullable: false),
                    empfaenger_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    empfaenger_dienstgrad = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    empfaenger_dienststelle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    datum = table.Column<DateOnly>(type: "date", nullable: false),
                    gelegenheit = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    begruendung = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ausgebende_stelle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    erfasst_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    erfasst_von = table.Column<Guid>(type: "uuid", nullable: false),
                    storniert_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    storniert_von = table.Column<Guid>(type: "uuid", nullable: true),
                    storno_grund = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ausgabe", x => x.id);
                    table.CheckConstraint("ck_ausgabe_storno", "(storniert_am IS NULL AND storniert_von IS NULL AND storno_grund IS NULL) OR (storniert_am IS NOT NULL AND storniert_von IS NOT NULL AND storno_grund IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_ausgabe_benutzer_erfasst_von",
                        column: x => x.erfasst_von,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_ausgabe_benutzer_storniert_von",
                        column: x => x.storniert_von,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_ausgabe_exemplar_coin_id_exemplar_nummer",
                        columns: x => new { x.coin_id, x.exemplar_nummer },
                        principalTable: "exemplar",
                        principalColumns: new[] { "coin_id", "nummer" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ausgabe_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    zeitpunkt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    akteur_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ausgabe_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exemplar_nummer = table.Column<int>(type: "integer", nullable: false),
                    art = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    grund = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ausgabe_audit", x => x.id);
                    table.CheckConstraint("ck_ausgabe_audit_art", "(art = 'Erfasst' AND grund IS NULL) OR (art = 'Storniert' AND grund IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_ausgabe_audit_ausgabe_ausgabe_id",
                        column: x => x.ausgabe_id,
                        principalTable: "ausgabe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_ausgabe_audit_benutzer_akteur_id",
                        column: x => x.akteur_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_coin_erfasst",
                table: "ausgabe",
                columns: new[] { "coin_id", "erfasst_am", "id" },
                descending: new[] { false, true, true });

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_exemplar",
                table: "ausgabe",
                columns: new[] { "coin_id", "exemplar_nummer" });

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_erfasst_von",
                table: "ausgabe",
                column: "erfasst_von");

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_storniert_von",
                table: "ausgabe",
                column: "storniert_von");

            migrationBuilder.CreateIndex(
                name: "ux_ausgabe_exemplar_aktiv",
                table: "ausgabe",
                columns: new[] { "coin_id", "exemplar_nummer" },
                unique: true,
                filter: "storniert_am IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_audit_akteur_id",
                table: "ausgabe_audit",
                column: "akteur_id");

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_audit_ausgabe",
                table: "ausgabe_audit",
                column: "ausgabe_id");

            // Exemplare 1 bis Auflage für bestehende Coins; Coins ohne Auflage erhalten keine (ADR-0020 Punkt 3).
            migrationBuilder.Sql(
                """
                INSERT INTO exemplar (coin_id, nummer)
                SELECT c.id, generate_series(1, c.auflage) FROM coin_typ c WHERE c.auflage IS NOT NULL;
                """);

            // Ausgaben sind nicht löschbar und nur einmal stornierbar (ADR-0020 Punkt 9). TRUNCATE bleibt möglich.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION ausgabe_nur_storno() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'ausgabe kann nicht gelöscht werden';
                    END IF;
                    IF OLD.storniert_am IS NOT NULL
                       OR NEW.storniert_am IS NULL
                       OR (NEW.id, NEW.coin_id, NEW.exemplar_nummer, NEW.empfaenger_name, NEW.empfaenger_dienstgrad,
                           NEW.empfaenger_dienststelle, NEW.datum, NEW.gelegenheit, NEW.begruendung,
                           NEW.ausgebende_stelle, NEW.erfasst_am, NEW.erfasst_von)
                          IS DISTINCT FROM
                          (OLD.id, OLD.coin_id, OLD.exemplar_nummer, OLD.empfaenger_name, OLD.empfaenger_dienstgrad,
                           OLD.empfaenger_dienststelle, OLD.datum, OLD.gelegenheit, OLD.begruendung,
                           OLD.ausgebende_stelle, OLD.erfasst_am, OLD.erfasst_von) THEN
                        RAISE EXCEPTION 'ausgabe kann nur einmal storniert und sonst nicht geändert werden';
                    END IF;
                    RETURN NEW;
                END
                $$;
                """);
            migrationBuilder.Sql(
                """
                CREATE TRIGGER trg_ausgabe_nur_storno
                    BEFORE UPDATE OR DELETE ON ausgabe
                    FOR EACH ROW EXECUTE FUNCTION ausgabe_nur_storno();
                """);

            // Audit-Einträge sind unveränderlich (ADR-0020 Punkt 10, wie ADR-0017).
            migrationBuilder.Sql(
                """
                CREATE FUNCTION ausgabe_audit_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'ausgabe_audit ist unveränderlich';
                END
                $$;
                """);
            migrationBuilder.Sql(
                """
                CREATE TRIGGER trg_ausgabe_audit_unveraenderlich
                    BEFORE UPDATE OR DELETE ON ausgabe_audit
                    FOR EACH ROW EXECUTE FUNCTION ausgabe_audit_unveraenderlich();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_ausgabe_audit_unveraenderlich ON ausgabe_audit;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS ausgabe_audit_unveraenderlich();");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_ausgabe_nur_storno ON ausgabe;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS ausgabe_nur_storno();");

            migrationBuilder.DropTable(
                name: "ausgabe_audit");

            migrationBuilder.DropTable(
                name: "ausgabe");

            migrationBuilder.DropTable(
                name: "exemplar");
        }
    }
}
