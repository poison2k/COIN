import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'
import { erzeugePng } from './hilfen/png'

// Systemtest startseite (Abschnitt 9.5, AK-36) gegen echten Systemtest-Keycloak (5184), echte API (5182) und
// Wegwerf-Datenbank. Testbenutzer sind synthetisch (infra/keycloak/coin-realm.json). Die Schritte bauen aufeinander auf
// (seriell): (1) Standard, (2) Logo + Infotext + Kopf, Betrachter und anonym, (3) Block aus und Reihenfolge, (4) SVG
// abgelehnt, (5) Betrachter ohne Zugriff auf die Verwaltung. Danach (afterAll, auch nach Fehlern) stellt der
// Administrator die Standardwerte wieder her, damit nachfolgende Specs auf `/` wieder „Willkommen bei C.O.I.N.“ sehen.

const ADMIN_EMAIL = 'admin@test.local'
const BETRACHTER_EMAIL = 'betrachter@test.local'
const BETRACHTER_NAME = 'Test Betrachter'
const WEB = 'http://localhost:5183'

const TITEL = `Systemtest Verband ${Date.now().toString(36)}`
const INFOTEXT = `Systemtest-Infotext ${Date.now().toString(36)}: Willkommen beim **Testverband**.`
const ALTTEXT = 'Wappen des Systemtest-Verbands'
const STANDARD_TITEL = 'C.O.I.N.'
const STANDARD_INFOTEXT =
  'C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.'
const SVG_MELDUNG = 'SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.'
const TEXT_KEINE_BERECHTIGUNG =
  'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.'

test.describe.configure({ mode: 'serial' })

/** Wählt in der Benutzerverwaltung die Rolle des Betrachters und bestätigt den Dialog. */
async function waehleRolle(page: Page, rolle: string): Promise<void> {
  await page.getByRole('combobox', { name: `Rolle von ${BETRACHTER_NAME}` }).click()
  await page.getByRole('option', { name: rolle, exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Rolle ändern' }).click()
  await expect(
    page.getByRole('status').filter({
      hasText: `Die Rolle von ${BETRACHTER_NAME} wurde auf ${rolle} geändert.`,
    }),
  ).toBeVisible()
}

/** Stellt wiederholbar her, dass betrachter@test.local aktiv ist und die Rolle „Betrachter“ hat (Admin in `page`). */
async function betrachterMitRolle(page: Page, browser: Browser): Promise<void> {
  const erste = await meldeAnInNeuemKontext(browser, BETRACHTER_EMAIL)
  await erste.kontext.close()

  await page.goto('/benutzerverwaltung')
  await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill(BETRACHTER_EMAIL)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Benutzer gefunden' })).toBeVisible()
  const auswahl = page.getByRole('combobox', {
    name: `Rolle von ${BETRACHTER_NAME}`,
  })
  await expect(auswahl).toBeVisible()
  if (!(await auswahl.textContent())?.includes('Betrachter')) await waehleRolle(page, 'Betrachter')
  const reaktivieren = page.getByRole('button', {
    name: `${BETRACHTER_NAME} reaktivieren`,
  })
  if (await reaktivieren.isVisible()) {
    await reaktivieren.click()
    await expect(page.getByRole('button', { name: `${BETRACHTER_NAME} deaktivieren` })).toBeVisible()
  }
  await expect(auswahl).toContainText('Betrachter')
}

/** Öffnet als Administrator die Konfigurationsseite und wartet, bis sie geladen ist. */
async function oeffneVerwaltung(page: Page): Promise<void> {
  await page.goto('/verwaltung/startseite')
  await expect(page.getByRole('heading', { level: 1, name: 'Startseite verwalten' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Kopfbereich anzeigen' })).toBeVisible()
}

async function speichern(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Die Startseite wurde gespeichert.' })).toBeVisible()
}

/** Ein Bild ist vollständig geladen und dekodiert. */
async function vollstaendigGeladen(bild: Locator): Promise<boolean> {
  return bild.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)
}

/** Namen der Abschnitte der Startseite in DOM-Reihenfolge (aria-label bzw. Überschrift). */
async function abschnitte(page: Page): Promise<string[]> {
  return page
    .getByRole('main')
    .getByRole('region')
    .evaluateAll((regionen) =>
      regionen.map((r) => r.getAttribute('aria-label') ?? r.querySelector('h2, h3')?.textContent?.trim() ?? ''),
    )
}

/**
 * Setzt die Startseite auf die Werte der Standardkonfiguration zurück (Kopf aus, Standardtitel ohne Logos,
 * Standard-Infotext, alle übrigen Blöcke an, Standardreihenfolge) und prüft `/`. Idempotent, damit es auch nach
 * einem Abbruch in der Mitte des seriellen Blocks greift.
 */
async function stelleStandardWiederHer(browser: Browser): Promise<void> {
  const admin = await meldeAnInNeuemKontext(browser, ADMIN_EMAIL)
  try {
    const page = admin.page
    await oeffneVerwaltung(page)

    for (const entfernen of await page.getByRole('button', { name: 'Logo entfernen' }).all()) {
      if (await entfernen.isVisible()) await entfernen.click()
    }
    await expect(page.getByRole('button', { name: 'Logo entfernen' })).toHaveCount(0)
    await page.getByRole('textbox', { name: /^Titel/ }).fill(STANDARD_TITEL)
    await page.getByRole('textbox', { name: /^Infotext/ }).fill(STANDARD_INFOTEXT)
    await page.getByRole('switch', { name: 'Kopfbereich anzeigen' }).setChecked(false)
    for (const name of ['Infotext', 'Kennzahlen', 'Neueste Coins', 'Meistausgegebene Coins']) {
      await page.getByRole('switch', { name: `${name} anzeigen` }).setChecked(true)
    }
    // Von unten nach oben je ganz nach oben schieben ergibt die Standardreihenfolge.
    for (const name of ['Meistausgegebene Coins', 'Neueste Coins', 'Kennzahlen', 'Infotext', 'Kopfbereich']) {
      const hoch = page.getByRole('button', { name: `${name} nach oben verschieben` })
      while ((await hoch.getAttribute('aria-disabled')) !== 'true') await hoch.click()
    }
    await speichern(page)

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()
  } finally {
    await admin.kontext.close()
  }
}

test.afterAll(async ({ browser }) => {
  await stelleStandardWiederHer(browser)
})

test('(1) Frische DB: Betrachter sieht die Standardblöcke mit h1 „Willkommen bei C.O.I.N.“ ohne Fehlermeldung', async ({
  page,
  browser,
}) => {
  await meldeAn(page, ADMIN_EMAIL)
  await betrachterMitRolle(page, browser)
  const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER_EMAIL)
  try {
    await betrachter.page.goto('/')

    await expect(
      betrachter.page.getByRole('heading', {
        level: 1,
        name: 'Willkommen bei C.O.I.N.',
      }),
    ).toBeVisible()
    await expect(betrachter.page.getByRole('region', { name: 'Information' })).toContainText(
      'C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr',
    )
    await expect(betrachter.page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()
    await expect(betrachter.page.getByRole('region', { name: 'Neueste Coins' })).toBeVisible()
    await expect(betrachter.page.getByRole('region', { name: 'Meistausgegebene Coins' })).toBeVisible()
    await expect(betrachter.page.getByRole('link', { name: 'Zum Katalog' })).toBeVisible()
    await expect(betrachter.page.getByRole('alert')).toHaveCount(0)
  } finally {
    await betrachter.kontext.close()
  }
})

test('(2) Administrator lädt ein Logo hoch, ändert den Infotext und speichert; Betrachter und anonyme Besucher sehen es', async ({
  page,
  browser,
}) => {
  await meldeAn(page, ADMIN_EMAIL)
  await oeffneVerwaltung(page)

  await page.getByRole('switch', { name: 'Kopfbereich anzeigen' }).click()
  await page.getByRole('textbox', { name: /^Titel/ }).fill(TITEL)
  await page
    .getByLabel('Logo auswählen')
    .first()
    .setInputFiles({
      name: 'wappen.png',
      mimeType: 'image/png',
      buffer: erzeugePng(64, 48),
    })
  await page
    .getByRole('textbox', { name: /^Alternativtext/ })
    .first()
    .fill(ALTTEXT)
  await page.getByRole('textbox', { name: /^Infotext/ }).fill(INFOTEXT)
  await speichern(page)

  // Betrachter: Logo (vollständig geladen) und Infotext.
  const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER_EMAIL)
  try {
    await betrachter.page.goto('/')
    await expect(betrachter.page.getByRole('heading', { level: 1, name: TITEL })).toBeVisible()
    const logo = betrachter.page.getByRole('img', { name: ALTTEXT })
    await expect(logo).toBeVisible()
    await expect.poll(() => vollstaendigGeladen(logo)).toBe(true)
    const information = betrachter.page.getByRole('region', {
      name: 'Information',
    })
    await expect(information).toContainText('Systemtest-Infotext')
    await expect(information.locator('strong')).toHaveText('Testverband')
  } finally {
    await betrachter.kontext.close()
  }

  // Anonym (neuer Kontext ohne Anmeldung): Titel und Logo, aber weder Infotext noch Kennzahlen.
  const anonym = await browser.newContext({ baseURL: WEB, locale: 'de-DE' })
  try {
    const seite = await anonym.newPage()
    const startseitenAufrufe: string[] = []
    seite.on('request', (r) => {
      const pfad = new URL(r.url()).pathname
      if (pfad.startsWith('/api/startseite')) startseitenAufrufe.push(pfad)
    })
    await seite.goto('/')
    await expect(seite.getByRole('heading', { level: 1, name: TITEL })).toBeVisible()
    const logo = seite.getByRole('img', { name: ALTTEXT })
    await expect(logo).toBeVisible()
    await expect.poll(() => vollstaendigGeladen(logo)).toBe(true)
    await expect(seite.getByText('Systemtest-Infotext')).toHaveCount(0)
    await expect(seite.getByRole('region', { name: 'Kennzahlen' })).toHaveCount(0)
    await expect(seite.getByRole('region', { name: 'Information' })).toHaveCount(0)
    expect(startseitenAufrufe).not.toContain('/api/startseite')
  } finally {
    await anonym.close()
  }
})

test('(3) Administrator schaltet „Kennzahlen“ aus und verschiebt „Meistausgegebene Coins“ nach oben; der Betrachter sieht es nach dem Neuladen', async ({
  page,
  browser,
}) => {
  const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER_EMAIL)
  try {
    await betrachter.page.goto('/')
    await expect(betrachter.page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()

    await meldeAn(page, ADMIN_EMAIL)
    await oeffneVerwaltung(page)
    await page.getByRole('switch', { name: 'Kennzahlen anzeigen' }).click()
    const hoch = page.getByRole('button', {
      name: 'Meistausgegebene Coins nach oben verschieben',
    })
    await hoch.focus()
    await page.keyboard.press('Enter')
    await expect(hoch).toBeFocused()
    await speichern(page)

    await betrachter.page.reload()

    await expect(betrachter.page.getByRole('region', { name: 'Meistausgegebene Coins' })).toBeVisible()
    await expect(betrachter.page.getByRole('region', { name: 'Kennzahlen' })).toHaveCount(0)
    const reihenfolge = (await abschnitte(betrachter.page)).filter((n) =>
      ['Neueste Coins', 'Meistausgegebene Coins'].includes(n),
    )
    expect(reihenfolge).toEqual(['Meistausgegebene Coins', 'Neueste Coins'])
  } finally {
    await betrachter.kontext.close()
  }
})

test('(4) Ein SVG als Logo wird mit „SVG-Dateien sind nicht erlaubt. …“ am Feld abgelehnt; nichts wird gespeichert', async ({
  page,
}) => {
  await meldeAn(page, ADMIN_EMAIL)
  await oeffneVerwaltung(page)

  // Endung und Typ täuschen ein PNG vor; der Server prüft den Inhalt (AK-11).
  await page
    .getByLabel('Logo auswählen')
    .nth(1)
    .setInputFiles({
      name: 'software.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8'),
    })
  await page
    .getByRole('textbox', { name: /^Alternativtext/ })
    .nth(1)
    .fill('Logo der Software (SVG)')
  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByText(SVG_MELDUNG)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Die Startseite wurde gespeichert.' })).toHaveCount(0)

  await oeffneVerwaltung(page)
  await expect(page.getByRole('img', { name: 'Logo der Software (SVG)' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: ALTTEXT })).toBeVisible()
})

test('(5) Betrachter hat keinen Menüpunkt; /verwaltung/startseite zeigt „Kein Zugriff“', async ({ browser }) => {
  const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER_EMAIL)
  try {
    await betrachter.page.goto('/')
    const navigation = betrachter.page.getByRole('navigation', {
      name: 'Hauptnavigation',
    })
    await expect(navigation.getByRole('link', { name: 'Katalog', exact: true })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Startseite verwalten' })).toHaveCount(0)

    await betrachter.page.goto('/verwaltung/startseite')

    await expect(betrachter.page).toHaveURL(/\/kein-zugriff\?grund=berechtigung$/)
    await expect(betrachter.page.getByText(TEXT_KEINE_BERECHTIGUNG)).toBeVisible()
  } finally {
    await betrachter.kontext.close()
  }
})
