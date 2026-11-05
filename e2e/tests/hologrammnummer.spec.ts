import { expect, test, type Browser, type Page } from "@playwright/test";
import { meldeAn, meldeAnInNeuemKontext } from "./hilfen/anmeldung";

// Systemtest hologrammnummer (AK-35, Entwurf Abschnitt 9) gegen echten Systemtest-Keycloak (5184), echte API (5182)
// und Wegwerf-Datenbank: Sachbearbeiter legt zwei Coins an und erfasst an A eine Ausgabe mit Hologrammnummer; dieselbe
// Nummer in anderer Schreibweise an B ist „bereits vergeben“. Der Betrachter prüft über die Sidebar: gültig mit Coin A,
// Zertifikatsnummer und Status, aber ohne Empfänger; mit Coin B „gehört nicht zu diesem Coin“; unbekannte Nummer „nicht
// gefunden“. Der Sachbearbeiter sieht beim Prüfen den Empfänger, storniert, prüft „storniert“ und kann die Nummer
// weiterhin nicht neu vergeben. Testbenutzer und Werte sind synthetisch; die Specs teilen sich die Datenbank.

const WEB = "http://localhost:5183";
const DETAIL_URL = new RegExp(
  `^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
);
const TEXT_VERGEBEN = "Diese Hologrammnummer ist bereits vergeben.";

const SACHBEARBEITER = {
  email: "sachbearbeiter@test.local",
  name: "Test Sachbearbeiter",
  rolle: "Sachbearbeiter",
};
const BETRACHTER = {
  email: "betrachter@test.local",
  name: "Test Betrachter",
  rolle: "Betrachter",
};

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Nur Buchstaben und Ziffern, damit die Nummer gültig bleibt (A–Z, 0–9). */
function eindeutigeZiffern(): string {
  return `${Date.now()}`.slice(-6) + `${Math.floor(Math.random() * 90 + 10)}`;
}

/** Stellt wiederholbar her, dass der Testbenutzer angelegt, aktiv und mit der Rolle ist (wie zertifikat-erzeugen.spec.ts). */
async function mitRolle(
  page: Page,
  browser: Browser,
  konto: { email: string; name: string; rolle: string },
): Promise<void> {
  const erste = await meldeAnInNeuemKontext(browser, konto.email);
  await erste.kontext.close();

  await page.goto("/benutzerverwaltung");
  await page
    .getByRole("searchbox", { name: "Benutzer suchen" })
    .fill(konto.email);
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 Benutzer gefunden" }),
  ).toBeVisible();
  const auswahl = page.getByRole("combobox", {
    name: `Rolle von ${konto.name}`,
  });
  await expect(auswahl).toBeVisible();
  if (!(await auswahl.textContent())?.includes(konto.rolle)) {
    await auswahl.click();
    await page.getByRole("option", { name: konto.rolle, exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Rolle ändern?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Rolle ändern" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({
          hasText: `Die Rolle von ${konto.name} wurde auf ${konto.rolle} geändert.`,
        }),
    ).toBeVisible();
  }
  const reaktivieren = page.getByRole("button", {
    name: `${konto.name} reaktivieren`,
  });
  if (await reaktivieren.isVisible()) {
    await reaktivieren.click();
    await expect(
      page.getByRole("button", { name: `${konto.name} deaktivieren` }),
    ).toBeVisible();
  }
  await expect(auswahl).toContainText(konto.rolle);
}

async function legeCoinAn(page: Page, name: string): Promise<string> {
  await page.goto("/coins/neu");
  await page.getByLabel(/^Name/).fill(name);
  await page
    .getByLabel(/^Herausgeber/)
    .fill("Systemtest Herausgeber Hologramm");
  await page.getByLabel(/^Auflage/).fill("5");
  await page.getByRole("button", { name: "Coin anlegen" }).click();
  await expect(page).toHaveURL(DETAIL_URL);
  return new URL(page.url()).pathname;
}

async function fuelleAusgabe(
  page: Page,
  detailPfad: string,
  empfaenger: string,
  hologrammnummer: string,
): Promise<void> {
  await page.goto(`${detailPfad}/ausgaben/neu`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ausgabe erfassen" }),
  ).toBeVisible();
  await page.getByLabel(/^Name des Empfängers/).fill(empfaenger);
  await page.getByLabel(/^Gelegenheit/).fill("Systemtest Gelegenheit");
  await page.getByLabel(/^Begründung/).fill("Systemtest Begründung");
  await page
    .getByLabel(/^Ausgebende Stelle oder Person/)
    .fill("Systemtest Kommandeur");
  const feld = page.getByLabel(/^Hologrammnummer/);
  await expect(
    feld,
    "Feld „Hologrammnummer (optional)“ fehlt (AK-26).",
  ).toBeVisible();
  await feld.fill(hologrammnummer);
  await page.getByRole("button", { name: "Ausgabe speichern" }).click();
}

/** Prüft auf /pruefung; optional mit Coin über die Combobox. */
async function pruefe(
  page: Page,
  nummer: string,
  coinName?: string,
): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: "Zertifikat prüfen" }),
  ).toBeVisible();
  const auswahlEntfernen = page.getByRole("button", {
    name: "Auswahl entfernen",
  });
  if (await auswahlEntfernen.isVisible()) await auswahlEntfernen.click();
  if (coinName) {
    const coin = page.getByRole("combobox", { name: /^Coin \(optional\)/ });
    await coin.click();
    await coin.fill(coinName);
    await page
      .getByRole("option", { name: new RegExp(`^${coinName} – `) })
      .click();
  }
  const feld = page.getByLabel(/^Hologrammnummer/);
  await feld.fill(nummer);
  await feld.press("Enter");
}

test("Sachbearbeiter erfasst mit Hologrammnummer, Betrachter prüft ohne Empfänger, nach Storno bleibt die Nummer gesperrt", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const coinA = eindeutig("Systemtest Hologramm A");
  const coinB = eindeutig("Systemtest Hologramm B");
  const empfaenger = `Systemtest Empfängerin ${eindeutig("Hx")}`;
  const ziffern = eindeutigeZiffern();
  const eingabe = `ab ${ziffern}-34`;
  const anzeige = `AB ${ziffern}-34`;
  const andereSchreibweise = `AB${ziffern}34`;
  let pfadA = "";
  let pfadB = "";

  await test.step("1. Admin vergibt die Rollen Sachbearbeiter und Betrachter", async () => {
    await meldeAn(page, "admin@test.local");
    await mitRolle(page, browser, SACHBEARBEITER);
    await mitRolle(page, browser, BETRACHTER);
  });

  const sachbearbeiter = await meldeAnInNeuemKontext(
    browser,
    SACHBEARBEITER.email,
  );
  try {
    const sb = sachbearbeiter.page;

    await test.step("2. Sachbearbeiter legt Coin A und B an und erfasst an A eine Ausgabe mit Hologrammnummer", async () => {
      pfadA = await legeCoinAn(sb, coinA);
      pfadB = await legeCoinAn(sb, coinB);
      await fuelleAusgabe(sb, pfadA, empfaenger, eingabe);
      await expect(sb).toHaveURL(`${WEB}${pfadA}`);
    });

    await test.step("3. Erfassen an B mit derselben Nummer in anderer Schreibweise → „bereits vergeben“", async () => {
      await fuelleAusgabe(
        sb,
        pfadB,
        "Systemtest Zweiter Empfänger",
        andereSchreibweise,
      );
      await expect(sb.getByText(TEXT_VERGEBEN)).toBeVisible();
      await expect(sb).toHaveURL(new RegExp(`${pfadB}/ausgaben/neu$`));
    });
  } finally {
    await sachbearbeiter.kontext.close();
  }

  await test.step("4. Betrachter prüft über die Sidebar: gültig ohne Empfänger, falscher Coin, unbekannte Nummer", async () => {
    const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER.email);
    try {
      const bt = betrachter.page;
      const pfade: string[] = [];
      bt.on("request", (r) => pfade.push(new URL(r.url()).pathname));

      await bt.goto("/");
      await bt
        .getByRole("navigation", { name: "Hauptnavigation" })
        .getByRole("link", { name: "Zertifikat prüfen" })
        .click();
      await expect(bt).toHaveURL(`${WEB}/pruefung`);

      await pruefe(bt, andereSchreibweise);
      await expect(
        bt.getByRole("heading", { level: 2, name: "Zertifikat gültig" }),
      ).toBeVisible();
      const ergebnis = bt
        .getByRole("status")
        .filter({ has: bt.getByRole("heading", { level: 2 }) });
      await expect(ergebnis.getByRole("link", { name: coinA })).toBeVisible();
      await expect(ergebnis).toContainText(/C[0-9]{4,}-0001/);
      await expect(ergebnis).toContainText(anzeige);
      await expect(ergebnis).toContainText("Aktiv");
      await expect(bt.locator("body")).not.toContainText(empfaenger);
      await expect(bt.getByRole("link", { name: "Zur Ausgabe" })).toHaveCount(
        0,
      );

      await pruefe(bt, eingabe, coinB);
      await expect(
        bt.getByRole("heading", {
          level: 2,
          name: "Die Nummer gehört nicht zu diesem Coin.",
        }),
      ).toBeVisible();

      await pruefe(bt, `ZZ${eindeutigeZiffern()}`);
      await expect(
        bt.getByRole("heading", {
          level: 2,
          name: "Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.",
        }),
      ).toBeVisible();

      expect(
        pfade.filter(
          (p) =>
            p === "/api/pruefung/mit-empfaenger" ||
            /\/api\/coins\/[^/]+\/ausgaben/.test(p),
        ),
      ).toEqual([]);
      expect(bt.url()).not.toContain(ziffern);
    } finally {
      await betrachter.kontext.close();
    }
  });

  await test.step("5. Sachbearbeiter sieht den Empfänger, storniert, prüft „storniert“; die Nummer bleibt vergeben", async () => {
    const zweite = await meldeAnInNeuemKontext(browser, SACHBEARBEITER.email);
    try {
      const sb = zweite.page;
      await sb.goto("/pruefung");
      await pruefe(sb, eingabe);
      await expect(
        sb.getByRole("heading", { level: 2, name: "Zertifikat gültig" }),
      ).toBeVisible();
      await expect(sb.getByText(empfaenger)).toBeVisible();

      await sb.goto(pfadA);
      await sb
        .getByRole("button", { name: "Ausgabe von Exemplar Nr. 1 stornieren" })
        .click();
      const dialog = sb.getByRole("alertdialog", {
        name: "Ausgabe stornieren?",
      });
      await dialog.getByLabel(/^Grund/).fill("Systemtest Storno Hologramm");
      await dialog.getByRole("button", { name: "Stornieren" }).click();
      await expect(dialog).toHaveCount(0);

      await sb.goto("/pruefung");
      await pruefe(sb, andereSchreibweise);
      await expect(
        sb.getByRole("heading", {
          level: 2,
          name: "Ausgabe storniert, Zertifikat ungültig",
        }),
      ).toBeVisible();
      await expect(
        sb.getByRole("status").filter({ hasText: "Storniert am" }),
      ).toContainText(/Storniert am \d{2}\.\d{2}\.\d{4}/);
      await expect(sb.locator("body")).not.toContainText(
        "Systemtest Storno Hologramm",
      );

      await fuelleAusgabe(sb, pfadB, "Systemtest Dritter Empfänger", eingabe);
      await expect(sb.getByText(TEXT_VERGEBEN)).toBeVisible();
    } finally {
      await zweite.kontext.close();
    }
  });
});
