using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <inheritdoc />
    public partial class Benutzerverwaltung : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "aktiv",
                table: "benutzer",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "benutzer_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    zeitpunkt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    akteur_id = table.Column<Guid>(type: "uuid", nullable: true),
                    benutzer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    art = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    alt = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    neu = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_benutzer_audit", x => x.id);
                    table.CheckConstraint("ck_benutzer_audit_werte", "((art = 'Rolle' AND alt IN ('Administrator', 'Sachbearbeiter', 'Betrachter', 'keine') AND neu IN ('Administrator', 'Sachbearbeiter', 'Betrachter', 'keine')) OR (art = 'Status' AND alt IN ('aktiv', 'deaktiviert') AND neu IN ('aktiv', 'deaktiviert'))) AND alt <> neu");
                    table.ForeignKey(
                        name: "fk_benutzer_audit_benutzer_akteur_id",
                        column: x => x.akteur_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_benutzer_audit_benutzer_benutzer_id",
                        column: x => x.benutzer_id,
                        principalTable: "benutzer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_benutzer_audit_akteur_id",
                table: "benutzer_audit",
                column: "akteur_id");

            migrationBuilder.CreateIndex(
                name: "ix_benutzer_audit_benutzer",
                table: "benutzer_audit",
                columns: new[] { "benutzer_id", "zeitpunkt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_benutzer_audit_zeitpunkt",
                table: "benutzer_audit",
                columns: new[] { "zeitpunkt", "id" },
                descending: new bool[0]);

            // ADR-0017 Punkt 4: Audit-Einträge sind unveränderlich, auch per SQL (TRUNCATE bleibt bewusst möglich).
            migrationBuilder.Sql(
                """
                CREATE FUNCTION benutzer_audit_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'benutzer_audit ist unveränderlich';
                END
                $$;
                """);
            migrationBuilder.Sql(
                """
                CREATE TRIGGER trg_benutzer_audit_unveraenderlich
                    BEFORE UPDATE OR DELETE ON benutzer_audit
                    FOR EACH ROW EXECUTE FUNCTION benutzer_audit_unveraenderlich();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_benutzer_audit_unveraenderlich ON benutzer_audit;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS benutzer_audit_unveraenderlich();");

            migrationBuilder.DropTable(
                name: "benutzer_audit");

            migrationBuilder.DropColumn(
                name: "aktiv",
                table: "benutzer");
        }
    }
}
