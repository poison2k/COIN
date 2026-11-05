using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <inheritdoc />
    public partial class Hologrammnummern : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ausgabe_hologramm",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    ausgabe_id = table.Column<Guid>(type: "uuid", nullable: false),
                    nummer = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    nummer_normalisiert = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false, computedColumnSql: "upper(translate(nummer, ' -', ''))", stored: true),
                    gesetzt_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    gesetzt_von = table.Column<Guid>(type: "uuid", nullable: false),
                    abgeloest_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ausgabe_hologramm", x => x.id);
                    table.CheckConstraint("ck_ausgabe_hologramm_nummer", "nummer ~ '^[A-Z0-9 -]{1,40}$' AND nummer = btrim(nummer) AND position('  ' IN nummer) = 0");
                    table.CheckConstraint("ck_ausgabe_hologramm_nummer_normalisiert", "nummer_normalisiert ~ '^[A-Z0-9]{1,40}$'");
                    table.ForeignKey(
                        name: "fk_ausgabe_hologramm_ausgabe_ausgabe_id",
                        column: x => x.ausgabe_id,
                        principalTable: "ausgabe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_ausgabe_hologramm_benutzer_gesetzt_von",
                        column: x => x.gesetzt_von,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "hologramm_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    zeitpunkt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    akteur_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ausgabe_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    art = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    nummer_alt = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    nummer_neu = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    grund = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_hologramm_audit", x => x.id);
                    table.CheckConstraint("ck_hologramm_audit_art", "(art = 'Gesetzt' AND nummer_alt IS NULL AND grund IS NULL) OR (art = 'Geaendert' AND nummer_alt IS NOT NULL AND grund IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_hologramm_audit_ausgabe_ausgabe_id",
                        column: x => x.ausgabe_id,
                        principalTable: "ausgabe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_hologramm_audit_benutzer_akteur_id",
                        column: x => x.akteur_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "pruefung_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    zeitpunkt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    akteur_id = table.Column<Guid>(type: "uuid", nullable: false),
                    nummer = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    coin_id_gewaehlt = table.Column<Guid>(type: "uuid", nullable: true),
                    ergebnis = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    ausgabe_id = table.Column<Guid>(type: "uuid", nullable: true),
                    mit_empfaenger = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_pruefung_audit", x => x.id);
                    table.CheckConstraint("ck_pruefung_audit_ausgabe", "(ergebnis = 'NichtGefunden') = (ausgabe_id IS NULL)");
                    table.CheckConstraint("ck_pruefung_audit_ergebnis", "ergebnis IN ('Gueltig', 'Storniert', 'FalscherCoin', 'NichtGefunden')");
                    table.ForeignKey(
                        name: "fk_pruefung_audit_ausgabe_ausgabe_id",
                        column: x => x.ausgabe_id,
                        principalTable: "ausgabe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pruefung_audit_benutzer_akteur_id",
                        column: x => x.akteur_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_hologramm_ausgabe",
                table: "ausgabe_hologramm",
                column: "ausgabe_id");

            migrationBuilder.CreateIndex(
                name: "ix_ausgabe_hologramm_gesetzt_von",
                table: "ausgabe_hologramm",
                column: "gesetzt_von");

            migrationBuilder.CreateIndex(
                name: "ux_ausgabe_hologramm_aktuell",
                table: "ausgabe_hologramm",
                column: "ausgabe_id",
                unique: true,
                filter: "abgeloest_am IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_ausgabe_hologramm_nummer",
                table: "ausgabe_hologramm",
                column: "nummer_normalisiert",
                unique: true,
                filter: "abgeloest_am IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_hologramm_audit_akteur_id",
                table: "hologramm_audit",
                column: "akteur_id");

            migrationBuilder.CreateIndex(
                name: "ix_hologramm_audit_ausgabe",
                table: "hologramm_audit",
                column: "ausgabe_id");

            migrationBuilder.CreateIndex(
                name: "ix_pruefung_audit_akteur",
                table: "pruefung_audit",
                column: "akteur_id");

            migrationBuilder.CreateIndex(
                name: "ix_pruefung_audit_ausgabe",
                table: "pruefung_audit",
                column: "ausgabe_id");

            migrationBuilder.CreateIndex(
                name: "ix_pruefung_audit_zeitpunkt",
                table: "pruefung_audit",
                column: "zeitpunkt");

            // Unveränderlich bis auf das einmalige Ablösen (ADR-0033 Punkt 2); ausgabe und trg_ausgabe_nur_storno bleiben
            // unverändert. TRUNCATE bleibt möglich (Tests, Betrieb).
            migrationBuilder.Sql(
                """
                CREATE FUNCTION ausgabe_hologramm_nur_abloesen() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'ausgabe_hologramm kann nicht gelöscht werden';
                    END IF;
                    IF OLD.abgeloest_am IS NULL AND NEW.abgeloest_am IS NOT NULL
                       AND NEW.id = OLD.id AND NEW.ausgabe_id = OLD.ausgabe_id AND NEW.nummer = OLD.nummer
                       AND NEW.gesetzt_am = OLD.gesetzt_am AND NEW.gesetzt_von = OLD.gesetzt_von THEN
                        RETURN NEW;
                    END IF;
                    RAISE EXCEPTION 'ausgabe_hologramm kann nur einmal abgelöst und sonst nicht geändert werden';
                END
                $$;
                CREATE TRIGGER trg_ausgabe_hologramm_nur_abloesen
                    BEFORE UPDATE OR DELETE ON ausgabe_hologramm
                    FOR EACH ROW EXECUTE FUNCTION ausgabe_hologramm_nur_abloesen();
                """);
            migrationBuilder.Sql(
                """
                CREATE FUNCTION hologramm_audit_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'hologramm_audit ist unveränderlich';
                END
                $$;
                CREATE TRIGGER trg_hologramm_audit_unveraenderlich
                    BEFORE UPDATE OR DELETE ON hologramm_audit
                    FOR EACH ROW EXECUTE FUNCTION hologramm_audit_unveraenderlich();
                """);
            migrationBuilder.Sql(
                """
                CREATE FUNCTION pruefung_audit_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'pruefung_audit ist unveränderlich';
                END
                $$;
                CREATE TRIGGER trg_pruefung_audit_unveraenderlich
                    BEFORE UPDATE OR DELETE ON pruefung_audit
                    FOR EACH ROW EXECUTE FUNCTION pruefung_audit_unveraenderlich();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_pruefung_audit_unveraenderlich ON pruefung_audit;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS pruefung_audit_unveraenderlich();");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_hologramm_audit_unveraenderlich ON hologramm_audit;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS hologramm_audit_unveraenderlich();");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_ausgabe_hologramm_nur_abloesen ON ausgabe_hologramm;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS ausgabe_hologramm_nur_abloesen();");

            migrationBuilder.DropTable(
                name: "ausgabe_hologramm");

            migrationBuilder.DropTable(
                name: "hologramm_audit");

            migrationBuilder.DropTable(
                name: "pruefung_audit");
        }
    }
}
