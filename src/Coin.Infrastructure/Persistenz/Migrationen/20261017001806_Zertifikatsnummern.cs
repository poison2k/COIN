using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <summary>
    /// zertifikat-erzeugen (ADR-0027 Punkt 6, ADR-0029): Coin-Kennung per Sequenz, Zertifikatsnummer je Ausgabe und
    /// Download-Audit. Reihenfolge: Sequenz und Funktion, Kennungen bestehender Coins nach <c>erstellt_am</c>, dann
    /// <c>id</c>, Sequenz auf den höchsten Wert, Nummern aller bestehenden Ausgaben (auch stornierter), erst danach
    /// <c>NOT NULL</c>, Indizes und Trigger.
    /// </summary>
    public partial class Zertifikatsnummern : Migration
    {
        /// <summary>Trigger-Funktion vor diesem Feature (Migration Exemplare), für <see cref="Down"/>.</summary>
        private const string AusgabeNurStornoAlt =
            """
            CREATE OR REPLACE FUNCTION ausgabe_nur_storno() RETURNS trigger LANGUAGE plpgsql AS $$
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
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Sequenz und Formatfunktion (ADR-0027 Punkt 2); lpad allein würde ab 5 Stellen kürzen.
            migrationBuilder.Sql("CREATE SEQUENCE coin_kennung_seq AS bigint START WITH 1 MINVALUE 1;");
            migrationBuilder.Sql(
                """
                CREATE FUNCTION coin_kennung_neu() RETURNS varchar LANGUAGE plpgsql VOLATILE AS $$
                DECLARE n bigint;
                BEGIN
                    n := nextval('coin_kennung_seq');
                    RETURN 'C' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END;
                END
                $$;
                """);

            // Kennungen bestehender Coins nach Anlagezeitpunkt, dann Id; danach steht die Sequenz auf dem höchsten Wert.
            migrationBuilder.AddColumn<string>(
                name: "kennung",
                table: "coin_typ",
                type: "character varying(12)",
                maxLength: 12,
                nullable: true);
            migrationBuilder.Sql(
                """
                UPDATE coin_typ c
                   SET kennung = 'C' || CASE WHEN n.nr < 10000 THEN lpad(n.nr::text, 4, '0') ELSE n.nr::text END
                  FROM (SELECT id, row_number() OVER (ORDER BY erstellt_am, id) AS nr FROM coin_typ) n
                 WHERE n.id = c.id;
                SELECT CASE WHEN count(*) = 0 THEN setval('coin_kennung_seq', 1, false)
                            ELSE setval('coin_kennung_seq', count(*), true) END
                  FROM coin_typ;
                ALTER TABLE coin_typ ALTER COLUMN kennung SET DEFAULT coin_kennung_neu();
                ALTER TABLE coin_typ ALTER COLUMN kennung SET NOT NULL;
                """);
            migrationBuilder.AddCheckConstraint(
                name: "ck_coin_typ_kennung",
                table: "coin_typ",
                sql: "kennung ~ '^C[0-9]{4,}$'");
            migrationBuilder.CreateIndex(
                name: "ux_coin_typ_kennung",
                table: "coin_typ",
                column: "kennung",
                unique: true);

            // Zertifikatsnummern aller bestehenden Ausgaben, auch stornierter (F4). Der Schutz-Trigger erlaubt sonst nur
            // das Storno; er wird für diese eine Anweisung ausgesetzt.
            migrationBuilder.AddColumn<string>(
                name: "zertifikatsnummer",
                table: "ausgabe",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
            migrationBuilder.Sql(
                """
                ALTER TABLE ausgabe DISABLE TRIGGER trg_ausgabe_nur_storno;
                UPDATE ausgabe a
                   SET zertifikatsnummer = c.kennung || '-' ||
                       CASE WHEN a.exemplar_nummer < 10000 THEN lpad(a.exemplar_nummer::text, 4, '0') ELSE a.exemplar_nummer::text END
                  FROM coin_typ c
                 WHERE c.id = a.coin_id;
                ALTER TABLE ausgabe ENABLE TRIGGER trg_ausgabe_nur_storno;
                ALTER TABLE ausgabe ALTER COLUMN zertifikatsnummer SET NOT NULL;
                """);
            migrationBuilder.CreateIndex(
                name: "ux_ausgabe_zertifikatsnummer_aktiv",
                table: "ausgabe",
                column: "zertifikatsnummer",
                unique: true,
                filter: "storniert_am IS NULL");

            // Die Nummer gehört zu den unveränderlichen Spalten (ADR-0027 Punkt 5).
            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION ausgabe_nur_storno() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'ausgabe kann nicht gelöscht werden';
                    END IF;
                    IF OLD.storniert_am IS NOT NULL
                       OR NEW.storniert_am IS NULL
                       OR (NEW.id, NEW.coin_id, NEW.exemplar_nummer, NEW.zertifikatsnummer, NEW.empfaenger_name,
                           NEW.empfaenger_dienstgrad, NEW.empfaenger_dienststelle, NEW.datum, NEW.gelegenheit,
                           NEW.begruendung, NEW.ausgebende_stelle, NEW.erfasst_am, NEW.erfasst_von)
                          IS DISTINCT FROM
                          (OLD.id, OLD.coin_id, OLD.exemplar_nummer, OLD.zertifikatsnummer, OLD.empfaenger_name,
                           OLD.empfaenger_dienstgrad, OLD.empfaenger_dienststelle, OLD.datum, OLD.gelegenheit,
                           OLD.begruendung, OLD.ausgebende_stelle, OLD.erfasst_am, OLD.erfasst_von) THEN
                        RAISE EXCEPTION 'ausgabe kann nur einmal storniert und sonst nicht geändert werden';
                    END IF;
                    RETURN NEW;
                END
                $$;
                """);

            // Die Kennung ist unveränderlich (ADR-0027 Punkt 3); andere Spalten bleiben änderbar.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION coin_typ_kennung_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.kennung IS DISTINCT FROM OLD.kennung THEN
                        RAISE EXCEPTION 'coin_typ.kennung ist unveränderlich';
                    END IF;
                    RETURN NEW;
                END
                $$;
                CREATE TRIGGER trg_coin_typ_kennung_unveraenderlich
                    BEFORE UPDATE ON coin_typ
                    FOR EACH ROW EXECUTE FUNCTION coin_typ_kennung_unveraenderlich();
                """);

            // Download-Audit (ADR-0029), unveränderlich per Trigger; TRUNCATE bleibt möglich.
            migrationBuilder.CreateTable(
                name: "zertifikat_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    zeitpunkt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    akteur_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ausgabe_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    zertifikatsnummer = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    vorlage_version = table.Column<int>(type: "integer", nullable: true),
                    art = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_zertifikat_audit", x => x.id);
                    table.CheckConstraint("ck_zertifikat_audit_art", "art = 'Heruntergeladen'");
                    table.ForeignKey(
                        name: "fk_zertifikat_audit_ausgabe_ausgabe_id",
                        column: x => x.ausgabe_id,
                        principalTable: "ausgabe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_zertifikat_audit_benutzer_akteur_id",
                        column: x => x.akteur_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });
            migrationBuilder.CreateIndex(
                name: "ix_zertifikat_audit_akteur_id",
                table: "zertifikat_audit",
                column: "akteur_id");
            migrationBuilder.CreateIndex(
                name: "ix_zertifikat_audit_ausgabe",
                table: "zertifikat_audit",
                column: "ausgabe_id");
            migrationBuilder.Sql(
                """
                CREATE FUNCTION zertifikat_audit_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'zertifikat_audit ist unveränderlich';
                END
                $$;
                CREATE TRIGGER trg_zertifikat_audit_unveraenderlich
                    BEFORE UPDATE OR DELETE ON zertifikat_audit
                    FOR EACH ROW EXECUTE FUNCTION zertifikat_audit_unveraenderlich();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_zertifikat_audit_unveraenderlich ON zertifikat_audit;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS zertifikat_audit_unveraenderlich();");
            migrationBuilder.DropTable(
                name: "zertifikat_audit");

            migrationBuilder.Sql(AusgabeNurStornoAlt);
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_coin_typ_kennung_unveraenderlich ON coin_typ;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS coin_typ_kennung_unveraenderlich();");

            migrationBuilder.DropIndex(
                name: "ux_ausgabe_zertifikatsnummer_aktiv",
                table: "ausgabe");
            migrationBuilder.DropColumn(
                name: "zertifikatsnummer",
                table: "ausgabe");

            migrationBuilder.DropIndex(
                name: "ux_coin_typ_kennung",
                table: "coin_typ");
            migrationBuilder.DropCheckConstraint(
                name: "ck_coin_typ_kennung",
                table: "coin_typ");
            migrationBuilder.DropColumn(
                name: "kennung",
                table: "coin_typ");

            migrationBuilder.Sql("DROP FUNCTION IF EXISTS coin_kennung_neu();");
            migrationBuilder.Sql("DROP SEQUENCE IF EXISTS coin_kennung_seq;");
        }
    }
}
