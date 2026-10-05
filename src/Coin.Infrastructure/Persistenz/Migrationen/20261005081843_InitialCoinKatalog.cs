using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Coin.Infrastructure.Persistenz.Migrationen
{
    /// <inheritdoc />
    public partial class InitialCoinKatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "coin_typ",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    herausgeber = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    auflage = table.Column<int>(type: "integer", nullable: true),
                    beschreibung = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    erstellt_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coin_typ", x => x.id);
                    table.CheckConstraint("ck_coin_typ_auflage", "auflage IS NULL OR auflage BETWEEN 1 AND 1000000");
                });

            migrationBuilder.CreateTable(
                name: "coin_bild",
                columns: table => new
                {
                    coin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    inhalt = table.Column<byte[]>(type: "bytea", nullable: false),
                    format = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    sha256 = table.Column<string>(type: "char(64)", nullable: false),
                    groesse_bytes = table.Column<int>(type: "integer", nullable: false),
                    hochgeladen_am = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coin_bild", x => x.coin_id);
                    table.CheckConstraint("ck_coin_bild_groesse_bytes", "groesse_bytes BETWEEN 1 AND 5242880");
                    table.ForeignKey(
                        name: "fk_coin_bild_coin_typ_coin_id",
                        column: x => x.coin_id,
                        principalTable: "coin_typ",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            // AK-8/AK-15: Eindeutigkeit ohne Beachtung der Schreibweise (Ausdrucksindex, ADR-0003).
            migrationBuilder.Sql(
                "CREATE UNIQUE INDEX ux_coin_typ_name_herausgeber ON coin_typ (lower(name), lower(herausgeber));");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS ux_coin_typ_name_herausgeber;");

            migrationBuilder.DropTable(
                name: "coin_bild");

            migrationBuilder.DropTable(
                name: "coin_typ");
        }
    }
}
