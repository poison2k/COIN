import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { meldeAn, meldeAnInNeuemKontext } from "./hilfen/anmeldung";

// Systemtest nacharbeiten-audit-filter (Entwurf Abschnitt 8; AK-8, AK-14 bis AK-19, AK-32, AK-33) gegen echten
// Systemtest-Keycloak (5184), echte API (5182) und Wegwerf-Datenbank: Der Administrator weist betrachter@test.local eine
// Rolle zu und deaktiviert und reaktiviert ihn (Rolle- und Status-Einträge). Im Änderungsprotokoll filtert er nach heute
// (Von = Bis = heute in Europe/Berlin) und „Status“, sieht nur Status-Einträge und die Chips, lädt neu (der Filter
// bleibt) und setzt zurück (alle Einträge). Ein Filter auf gestern zeigt „Keine Einträge für diese Filter.“. Der
// Betrachter erhält für GET /api/audit?aktion=Status 403. Dazu axe und 360 px ohne Überlauf, hell und dunkel.
// Der Test endet mit aktivem Betrachter und Rolle „Betrachter“ (wiederholbar). Alle Werte synthetisch.

const WEB = "http://localhost:5183";
const ZIEL_EMAIL = "betrachter@test.local";
const ZIEL_NAME = "Test Betrachter";

test.describe.configure({ mode: "serial" });

/** Kalendertag JJJJ-MM-TT in Europe/Berlin, `versatz` Tage verschoben. */
function berlinerTag(versatz = 0): string {
  const zeit = new Date(Date.now() + versatz * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(zeit);
}

/** „TT.MM.JJJJ“ zu einem Kalendertag JJJJ-MM-TT. */
function deutsch(tag: string): string {
  const [jahr, monat, t] = tag.split("-");
  return `${t}.${monat}.${jahr}`;
}

async function axeVerstoesse(page: Page): Promise<string[]> {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return ergebnis.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes.map(
        (n) => `${v.id} (${v.impact}) ${n.target.join(" ")} – ${v.helpUrl}`,
      ),
    );
}

async function sucheBetrachter(page: Page): Promise<void> {
  await page.goto("/benutzerverwaltung");
  await expect(
    page.getByRole("heading", { level: 1, name: "Benutzerverwaltung" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Benutzer suchen" })
    .fill(ZIEL_EMAIL);
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 Benutzer gefunden" }),
  ).toBeVisible();
}

async function waehleRolle(page: Page, rolle: string): Promise<void> {
  await page.getByRole("combobox", { name: `Rolle von ${ZIEL_NAME}` }).click();
  await page.getByRole("option", { name: rolle, exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Rolle ändern?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Rolle ändern" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({
        hasText: `Die Rolle von ${ZIEL_NAME} wurde auf ${rolle} geändert.`,
      }),
  ).toBeVisible();
}

const panel = (page: Page) =>
  page.getByRole("tabpanel", { name: "Änderungsprotokoll" });
const tabelle = (page: Page) =>
  panel(page).getByRole("table", { name: "Änderungsprotokoll" });
const chips = (page: Page) =>
  panel(page)
    .getByRole("list", { name: "Aktive Filter" })
    .getByRole("listitem");
const datenzeilen = (page: Page) =>
  tabelle(page)
    .getByRole("row")
    .filter({ hasNot: page.getByRole("columnheader") });

/** Inhalte der Spalte „Änderung“ (vierte Zelle) aller Datenzeilen. */
async function aenderungen(page: Page): Promise<string[]> {
  return datenzeilen(page).evaluateAll((zeilen) =>
    zeilen.map((z) => (z.querySelectorAll("td")[3]?.textContent ?? "").trim()),
  );
}

test("Administrator filtert das Änderungsprotokoll nach heute und „Status“, lädt neu und setzt zurück", async ({
  page,
  browser,
}) => {
  test.slow();
  // 1. Ausgangszustand: Der Betrachter ist angelegt.
  const erste = await meldeAnInNeuemKontext(browser, ZIEL_EMAIL);
  await erste.kontext.close();

  // 2. Der Administrator erzeugt Rolle- und Status-Einträge.
  await meldeAn(page, "admin@test.local");
  await sucheBetrachter(page);
  const auswahl = page.getByRole("combobox", {
    name: `Rolle von ${ZIEL_NAME}`,
  });
  await expect(auswahl).toBeVisible();
  if ((await auswahl.textContent())?.includes("Betrachter"))
    await waehleRolle(page, "Keine Rolle");
  await waehleRolle(page, "Betrachter");
  const reaktivieren = page.getByRole("button", {
    name: `${ZIEL_NAME} reaktivieren`,
  });
  if (await reaktivieren.isVisible()) {
    await reaktivieren.click();
    await expect(
      page.getByRole("button", { name: `${ZIEL_NAME} deaktivieren` }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: `${ZIEL_NAME} deaktivieren` }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Benutzer deaktivieren?",
  });
  await dialog.getByRole("button", { name: "Deaktivieren" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: `${ZIEL_NAME} wurde deaktiviert.` }),
  ).toBeVisible();
  await page.getByRole("button", { name: `${ZIEL_NAME} reaktivieren` }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: `${ZIEL_NAME} wurde reaktiviert.` }),
  ).toBeVisible();

  // 3. Änderungsprotokoll ohne Filter: Rolle- und Status-Einträge.
  await page.getByRole("tab", { name: "Änderungsprotokoll" }).click();
  await expect(page).toHaveURL(
    `${WEB}/benutzerverwaltung?reiter=aenderungsprotokoll`,
  );
  await expect(tabelle(page)).toBeVisible();
  const alle = await datenzeilen(page).count();
  expect(new Set(await aenderungen(page))).toEqual(
    new Set(["Rolle", "Status"]),
  );

  // 4. Filter: Von = Bis = heute (Berlin) und „Status“.
  const heute = berlinerTag();
  await panel(page).getByLabel(/^Von/).fill(heute);
  await panel(page).getByLabel(/^Bis/).fill(heute);
  await panel(page).getByRole("checkbox", { name: "Status" }).check();

  await expect(chips(page)).toHaveText([
    `Von: ${deutsch(heute)}`,
    `Bis: ${deutsch(heute)}`,
    "Aktion: Status",
  ]);
  await expect
    .poll(async () => [...new Set(await aenderungen(page))])
    .toEqual(["Status"]);
  const gefiltert = await datenzeilen(page).count();
  expect(gefiltert).toBeGreaterThanOrEqual(2);
  expect(gefiltert).toBeLessThan(alle);
  const url = new URL(page.url());
  expect(Object.fromEntries(url.searchParams)).toEqual({
    reiter: "aenderungsprotokoll",
    von: heute,
    bis: heute,
    aktion: "Status",
  });
  expect(decodeURIComponent(page.url())).not.toContain(ZIEL_NAME);

  // 5. Neu laden: Reiter, Felder, Checkbox, Chips und Einträge bleiben.
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Änderungsprotokoll" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByLabel(/^Von/)).toHaveValue(heute);
  await expect(panel(page).getByLabel(/^Bis/)).toHaveValue(heute);
  await expect(
    panel(page).getByRole("checkbox", { name: "Status" }),
  ).toBeChecked();
  await expect(chips(page)).toHaveText([
    `Von: ${deutsch(heute)}`,
    `Bis: ${deutsch(heute)}`,
    "Aktion: Status",
  ]);
  await expect(datenzeilen(page)).toHaveCount(gefiltert);

  // 6. axe und 360 px ohne Überlauf mit aktivem Filter, hell und dunkel.
  const befunde: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(
      (wert) => localStorage.setItem("coin-theme", wert),
      theme,
    );
    for (const breite of [360, 1280]) {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.reload();
      await expect(chips(page)).toHaveCount(3);
      await expect(page.locator("html")).toHaveClass(
        new RegExp(`(^|\\s)${theme}(\\s|$)`),
      );
      befunde.push(
        ...(await axeVerstoesse(page)).map((v) => `${theme} ${breite}: ${v}`),
      );
      const m = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth,
        i: window.innerWidth,
      }));
      if (m.s > m.i)
        befunde.push(
          `${theme} ${breite}: horizontales Scrollen (${m.s} > ${m.i})`,
        );
    }
  }
  await page.evaluate(() => localStorage.setItem("coin-theme", "light"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  expect(befunde).toEqual([]);

  // 7. „Filter zurücksetzen“: alle Einträge, keine Filterparameter, Fokus auf „Von“.
  await panel(page)
    .getByRole("button", { name: "Filter zurücksetzen" })
    .click();
  await expect(datenzeilen(page)).toHaveCount(alle);
  await expect(page).toHaveURL(
    `${WEB}/benutzerverwaltung?reiter=aenderungsprotokoll`,
  );
  await expect(panel(page).getByLabel(/^Von/)).toBeFocused();

  // 8. Filter auf gestern: Leerzustand.
  const gestern = berlinerTag(-1);
  await panel(page).getByLabel(/^Von/).fill(gestern);
  await panel(page).getByLabel(/^Bis/).fill(gestern);
  await expect(
    panel(page).getByRole("heading", {
      level: 3,
      name: "Keine Einträge für diese Filter.",
    }),
  ).toBeVisible();
});

test("Betrachter erhält für GET /api/audit?aktion=Status 403", async ({
  browser,
}) => {
  const sitzung = await meldeAnInNeuemKontext(browser, ZIEL_EMAIL);
  try {
    const token = await sitzung.page.evaluate(() => {
      const schluessel = Object.keys(sessionStorage).find((k) =>
        k.startsWith("oidc.user:"),
      );
      return schluessel
        ? (
            JSON.parse(sessionStorage.getItem(schluessel)!) as {
              access_token: string;
            }
          ).access_token
        : "";
    });
    expect(token).not.toBe("");

    const antwort = await sitzung.page.request.get(
      `${WEB}/api/audit?aktion=Status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    expect(antwort.status()).toBe(403);
  } finally {
    await sitzung.kontext.close();
  }
});
