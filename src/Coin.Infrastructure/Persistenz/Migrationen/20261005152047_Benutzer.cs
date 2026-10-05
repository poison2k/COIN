using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <inheritdoc />
    public partial class Benutzer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "benutzer",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    subject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    anzeigename = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    rolle = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    erstellt_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    aktualisiert_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_benutzer", x => x.id);
                    table.CheckConstraint("ck_benutzer_rolle", "rolle IS NULL OR rolle IN ('Administrator', 'Sachbearbeiter', 'Betrachter')");
                });

            migrationBuilder.CreateIndex(
                name: "ux_benutzer_issuer_subject",
                table: "benutzer",
                columns: new[] { "issuer", "subject" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "benutzer");
        }
    }
}
