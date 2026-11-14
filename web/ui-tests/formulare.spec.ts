import { expect, test, type Page } from '@playwright/test'
import {
  ADMIN,
  AUSGABE,
  COIN,
  MOTIV_PNG,
  NEUER_COIN_ID,
  nichtVerdeckt,
  oeffne,
  richteFormularApiEin,
  tabBis,
  type SchreibZustand,
} from './hilfen/formulare.js'
import { scrolltNichtHorizontal } from './hilfen/api.js'

// Feature formulare-detailseiten, Abschnitt 8 (UI-Test, gemockte API): AK-1 (Abschnitte, zwei Spalten), AK-4 bis AK-8
// (Validierung, Zusammenfassung, Meldungen), AK-9 (Aktionsleiste: Lage, sticky, Fokus nicht verdeckt), AK-10
// (Ladezustand, Doppelklick = 1 Request) und AK-11 (jedes Formular per Tastatur bei 1280 und 360 px). Alle Daten
// synthetisch.

test.use({ timezoneId: 'Europe/Berlin' })

let api: SchreibZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const DETAIL = `/coins/${COIN.id}`
const AUSGABE_SEITE = `${DETAIL}/ausgaben/${AUSGABE.id}`

function aktionsleiste(page: Page, hauptaktion: string) {
  return page
    .getByRole('button', { name: hauptaktion })
    .locator('xpath=ancestor::*[.//*[self::a or self::button][normalize-space()="Abbrechen"]][1]')
}

async function tippe(page: Page, ziel: ReturnType<Page['getByLabel']>, text: string) {
  await tabBis(page, ziel)
  await page.keyboard.type(text)
}

// ---------- AK-11: Tastatur je Formular bei 1280 und 360 px ----------

for (const breite of [1280, 360]) {
  test.describe(`Tastatur bei ${breite} px (AK-11)`, () => {
    test('Coin anlegen: ausfüllen und mit Enter absenden', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, '/coins/neu', 'Coin hinzufügen', breite)

      await tippe(page, page.getByLabel(/^Name/), 'Coin Neu')
      await tippe(page, page.getByLabel(/^Herausgeber/), 'Herausgeber Neu')
      await tippe(page, page.getByLabel(/^Auflage/), '100')
      await page.keyboard.press('Enter')

      await expect(page).toHaveURL(new RegExp(`/coins/${NEUER_COIN_ID}$`))
      await expect(page.getByRole('status').filter({ hasText: 'Coin wurde angelegt.' })).toBeVisible()
      expect(api.schreiben.filter((a) => a.methode === 'POST').map((a) => a.body)).toEqual([
        { name: 'Coin Neu', herausgeber: 'Herausgeber Neu', auflage: 100, beschreibung: null },
      ])
    })

    test('Coin bearbeiten: Namen ändern und mit Enter speichern', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten', breite)

      await tabBis(page, page.getByLabel(/^Name/))
      await page.keyboard.press('End')
      await page.keyboard.type(' Neu')
      await page.keyboard.press('Enter')

      await expect(page).toHaveURL(new RegExp(`${DETAIL}$`))
      await expect(page.getByRole('status').filter({ hasText: 'Änderungen wurden gespeichert.' })).toBeVisible()
      expect(api.schreiben.filter((a) => a.methode === 'PUT')).toHaveLength(1)
    })

    test('Coin bearbeiten: Motivbild per Tab wählen, Enter auf „Bild hochladen“', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten', breite)

      const feld = page.getByLabel(/^Neues Motivbild/)
      await tabBis(page, feld)
      await feld.setInputFiles(MOTIV_PNG)
      await tabBis(page, page.getByRole('button', { name: 'Bild hochladen' }), 5)
      await page.keyboard.press('Enter')

      await expect(page.getByRole('status').filter({ hasText: 'Motivbild wurde gespeichert.' })).toBeVisible()
      expect(api.schreiben.filter((a) => a.methode === 'PUT').map((a) => a.pfad)).toEqual([
        `/api/coins/${COIN.id}/bild`,
      ])
    })

    test('Ausgabe erfassen: Radio per Pfeiltaste, Felder per Tab, Enter sendet', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, `${DETAIL}/ausgaben/neu`, 'Ausgabe erfassen', breite)

      await tabBis(page, page.getByRole('radio', { name: 'Nächstes freies Exemplar' }))
      await page.keyboard.press('ArrowDown')
      await expect(page.getByRole('radio', { name: 'Bestimmte Nummer' })).toBeChecked()
      await tippe(page, page.getByLabel(/^Exemplar-Nummer/), '2')
      await tippe(page, page.getByLabel(/^Name des Empfängers/), 'Testperson A')
      await tippe(page, page.getByLabel(/^Gelegenheit/), 'Truppenbesuch')
      await tippe(page, page.getByLabel(/^Begründung/), 'Herausragende Leistung')
      await tippe(page, page.getByLabel(/^Ausgebende Stelle oder Person/), 'Dienststelle Beispiel')
      await page.keyboard.press('Enter')

      await expect(page).toHaveURL(new RegExp(`${DETAIL}$`))
      await expect(page.getByRole('status').filter({ hasText: 'Exemplar Nr. 2 wurde ausgegeben.' })).toBeVisible()
      expect((api.schreiben.find((a) => a.methode === 'POST')?.body as { exemplarNummer: number }).exemplarNummer).toBe(
        2,
      )
    })

    test('Hologrammnummer korrigieren: Dialog per Tastatur', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, AUSGABE_SEITE, `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer}`, breite)

      await tabBis(page, page.getByRole('button', { name: 'Hologrammnummer korrigieren' }))
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Hologrammnummer korrigieren' })
      await expect(dialog.getByLabel(/^Hologrammnummer/)).toBeFocused()
      await page.keyboard.press('Control+A')
      await page.keyboard.type('xy 77')
      await tippe(page, dialog.getByLabel(/^Grund der Korrektur/), 'Zahlendreher')
      await tabBis(page, dialog.getByRole('button', { name: 'Speichern' }), 5)
      await page.keyboard.press('Enter')

      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'Hologrammnummer gespeichert.' })).toBeVisible()
    })

    test('Auflage ändern: Dialog per Tastatur', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, DETAIL, COIN.name, breite)

      await tabBis(page, page.getByRole('button', { name: 'Auflage ändern' }))
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Auflage ändern' })
      await expect(dialog.getByLabel(/^Auflage/)).toBeFocused()
      await page.keyboard.press('Control+A')
      await page.keyboard.type('50')
      await page.keyboard.press('Enter')

      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'Auflage wurde geändert.' })).toBeVisible()
    })

    test('Stornieren in der Historie: Bestätigungsdialog per Tastatur', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, `${DETAIL}?reiter=ausgaben`, COIN.name, breite)

      await tabBis(
        page,
        page.getByRole('button', { name: `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer} stornieren` }),
      )
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
      await expect(dialog.getByLabel(/^Grund/)).toBeFocused()
      await page.keyboard.type('Doppelt erfasst')
      await tabBis(page, dialog.getByRole('button', { name: 'Stornieren' }), 5)
      await page.keyboard.press('Enter')

      await expect(dialog).toHaveCount(0)
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer} wurde storniert.` }),
      ).toBeVisible()
      expect(api.schreiben.filter((a) => a.pfad.endsWith('/storno')).map((a) => a.body)).toEqual([
        { grund: 'Doppelt erfasst' },
      ])
    })

    test('Vorlage hochladen: Dateifeld per Tab, Datei wählen, Enter auf „Vorlage hochladen“', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, `${DETAIL}?reiter=vorlage`, COIN.name, breite)

      const feld = page.getByLabel(/^Word-Vorlage \(\.docx\)/)
      await tabBis(page, feld)
      await feld.setInputFiles({
        name: 'urkunde.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('PK-synthetische-vorlage'),
      })
      await tabBis(page, page.getByRole('button', { name: 'Vorlage hochladen' }), 5)
      await page.keyboard.press('Enter')

      await expect(
        page.getByRole('status').filter({ hasText: 'Version 1 wurde hochgeladen und ist jetzt aktiv.' }),
      ).toBeVisible()
    })

    test('Benutzerverwaltung: Suche per Tastatur', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, '/benutzerverwaltung', 'Benutzerverwaltung', breite)

      await tippe(page, page.getByRole('searchbox', { name: 'Benutzer suchen' }), 'Test')
      await page.keyboard.press('Enter')

      await expect(page.getByRole('status').filter({ hasText: /Benutzer gefunden/ })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Aktive Filter' })).toContainText('Suche: Test')
    })

    test('Startseite: Infotext ändern und per Tastatur speichern', async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, '/verwaltung/startseite', 'Startseite verwalten', breite)

      await tabBis(page, page.getByRole('textbox', { name: /^Infotext/ }))
      await page.keyboard.press('End')
      await page.keyboard.type(' Ergänzt.')
      await tabBis(page, page.getByRole('button', { name: 'Speichern' }), 80)
      await page.keyboard.press('Enter')

      await expect(page.getByRole('status').filter({ hasText: 'Die Startseite wurde gespeichert.' })).toBeVisible()
    })
  })
}

// ---------- AK-1: Abschnitte und zwei Spalten ----------

test.describe('Abschnitte und Spalten (AK-1)', () => {
  const PAARE = [
    { pfad: '/coins/neu', h1: 'Coin hinzufügen', links: /^Name/, rechts: /^Herausgeber/ },
    { pfad: `${DETAIL}/bearbeiten`, h1: 'Coin bearbeiten', links: /^Name/, rechts: /^Herausgeber/ },
    { pfad: `${DETAIL}/ausgaben/neu`, h1: 'Ausgabe erfassen', links: /^Dienstgrad/, rechts: /^Dienststelle/ },
    { pfad: `${DETAIL}/ausgaben/neu`, h1: 'Ausgabe erfassen', links: /^Datum/, rechts: /^Gelegenheit/ },
    { pfad: '/verwaltung/startseite', h1: 'Startseite verwalten', links: /^Titel/, rechts: /^Untertitel/ },
  ]

  for (const { pfad, h1, links, rechts } of PAARE) {
    test(`stellt ${links} und ${rechts} auf ${pfad} bei 1280 px nebeneinander`, async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, pfad, h1, 1280)

      const a = (await page.getByLabel(links).first().boundingBox())!
      const b = (await page.getByLabel(rechts).first().boundingBox())!
      expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
      expect(b.x).toBeGreaterThan(a.x)
    })

    test(`stellt ${links} und ${rechts} auf ${pfad} bei 360 px untereinander`, async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, pfad, h1, 360)

      const a = (await page.getByLabel(links).first().boundingBox())!
      const b = (await page.getByLabel(rechts).first().boundingBox())!
      expect(b.y).toBeGreaterThan(a.y + a.height - 1)
    })
  }

  test('gliedert „Ausgabe erfassen“ in die Gruppen „Exemplar“, „Empfänger“, „Ausgabe“, „Zertifikat“', async ({
    page,
  }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/ausgaben/neu`, 'Ausgabe erfassen')

    for (const name of ['Exemplar', 'Empfänger', 'Ausgabe', 'Zertifikat']) {
      await expect(page.getByRole('group', { name, exact: true })).toBeVisible()
    }
  })
})

// ---------- AK-4 bis AK-8: Validierung und Zusammenfassung ----------

test.describe('Validierung (AK-4 bis AK-8)', () => {
  test('Verlassen ohne Änderung erzeugt keinen Fehler', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')

    await tabBis(page, page.getByLabel(/^Name/))
    await page.keyboard.press('Tab')

    await expect(page.getByLabel(/^Name/)).not.toHaveAttribute('aria-invalid', 'true')
  })

  test('ungültige Auflage zeigt die Meldung erst nach dem Verlassen', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    const auflage = page.getByLabel(/^Auflage/)

    await tippe(page, auflage, 'abc')
    await expect(auflage).not.toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Tab')

    await expect(auflage).toHaveAttribute('aria-invalid', 'true')
    await expect(auflage).toHaveAccessibleDescription(/Auflage muss eine ganze Zahl sein\./)
  })

  test('leeres Absenden: kein Request, Fokus auf „Name“, Zusammenfassung oben mit Links', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')

    await page.getByRole('button', { name: 'Coin anlegen' }).click()

    await expect(page.getByLabel(/^Name/)).toBeFocused()
    const zusammenfassung = page.getByRole('alert').filter({ hasText: 'Bitte die markierten Eingaben prüfen.' })
    await expect(zusammenfassung).toBeVisible()
    await expect(zusammenfassung.getByRole('link')).toHaveCount(2)
    const z = (await zusammenfassung.boundingBox())!
    const name = (await page.getByLabel(/^Name/).boundingBox())!
    expect(z.y).toBeLessThan(name.y)
    expect(api.schreiben).toEqual([])
  })

  test('Link der Zusammenfassung fokussiert per Enter das Feld, die URL bleibt', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByRole('button', { name: 'Coin anlegen' }).click()
    const link = page.getByRole('alert').getByRole('link', { name: /^Herausgeber.*: Herausgeber ist erforderlich\.$/ })
    const url = page.url()

    await link.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByLabel(/^Herausgeber/)).toBeFocused()
    expect(page.url()).toBe(url)
  })

  test('Konflikt erscheint oben im Formular, Eingaben bleiben', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await page.route(
      (url) => url.pathname === '/api/coins',
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 409,
              contentType: 'application/problem+json',
              body: JSON.stringify({ status: 409, title: 'Konflikt' }),
            })
          : route.fallback(),
    )
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await page.getByLabel(/^Herausgeber/).fill('Herausgeber Neu')

    await page.getByRole('button', { name: 'Coin anlegen' }).click()

    const alarm = page
      .getByRole('alert')
      .filter({ hasText: 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.' })
    await expect(alarm).toBeVisible()
    expect((await alarm.boundingBox())!.y).toBeLessThan((await page.getByLabel(/^Name/).boundingBox())!.y)
    await expect(page.getByLabel(/^Name/)).toHaveValue('Coin Neu')
  })
})

// ---------- AK-9: Aktionsleiste ----------

test.describe('Aktionsleiste (AK-9)', () => {
  const FORMULARE = [
    { pfad: '/coins/neu', h1: 'Coin hinzufügen', haupt: 'Coin anlegen' },
    { pfad: `${DETAIL}/bearbeiten`, h1: 'Coin bearbeiten', haupt: 'Änderungen speichern' },
    { pfad: `${DETAIL}/ausgaben/neu`, h1: 'Ausgabe erfassen', haupt: 'Ausgabe speichern' },
  ]

  for (const { pfad, h1, haupt } of FORMULARE) {
    test(`stellt bei 1280 px auf ${pfad} „${haupt}“ rechts neben „Abbrechen“`, async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, pfad, h1, 1280)

      const abbrechen = (await page.getByRole('link', { name: 'Abbrechen' }).boundingBox())!
      const hauptaktion = (await page.getByRole('button', { name: haupt }).boundingBox())!
      expect(
        Math.abs(abbrechen.y + abbrechen.height / 2 - (hauptaktion.y + hauptaktion.height / 2)),
      ).toBeLessThanOrEqual(2)
      expect(hauptaktion.x).toBeGreaterThan(abbrechen.x)
    })

    test(`hält bei 360 px auf ${pfad} die Leiste beim Scrollen am unteren Rand`, async ({ page }) => {
      // 360×640: Das Formular ist länger als der Viewport, die natürliche Lage der Leiste liegt darunter. Gemessen wird
      // erst nach dem Laden der Webschrift, sonst verschieben sich die Höhen (Review-Runde 3, W1).
      const HOEHE = 640
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, pfad, h1, 360)
      await page.setViewportSize({ width: 360, height: HOEHE })
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => window.scrollTo(0, 0))
      const leiste = aktionsleiste(page, haupt)

      const natuerlich = await leiste.evaluate((el: HTMLElement) => {
        const vorher = el.style.position
        el.style.position = 'static'
        const unten = el.getBoundingClientRect().bottom
        el.style.position = vorher
        return unten
      })
      expect(natuerlich, 'Ohne sticky läge die Leiste im Viewport, Kleben wäre nicht nachweisbar').toBeGreaterThan(
        HOEHE + 1,
      )

      const unten = await leiste.evaluate((el) => el.getBoundingClientRect().bottom)
      expect(Math.abs(unten - HOEHE)).toBeLessThanOrEqual(1)
      const abbrechen = page.getByRole('link', { name: 'Abbrechen' })
      const hauptaktion = page.getByRole('button', { name: haupt })
      await expect(abbrechen).toBeInViewport()
      await expect(hauptaktion).toBeInViewport()
      for (const knopf of [abbrechen, hauptaktion]) {
        expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(40)
      }
      await scrolltNichtHorizontal(page)
    })

    test(`verdeckt bei 360 px auf ${pfad} kein per Tab fokussiertes Feld`, async ({ page }) => {
      api = await richteFormularApiEin(page, ADMIN)
      await oeffne(page, pfad, h1, 360)
      const leiste = aktionsleiste(page, haupt)

      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab')
        // Das fokussierte Element über document.activeElement bestimmen: Beim nativen Datumsfeld liegt der Fokus auf
        // einem Teil im Shadow DOM (Kalender-Button), dort trifft ':focus' nichts; geprüft wird dann das Datumsfeld.
        const fokus = page.locator('[data-fokus-pruefung]')
        const istFeld = await page.evaluate(() => {
          document.querySelector('[data-fokus-pruefung]')?.removeAttribute('data-fokus-pruefung')
          const el = document.activeElement
          if (!el) return false
          const feld = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.getAttribute('role') === 'radio'
          if (feld) el.setAttribute('data-fokus-pruefung', '')
          return feld
        })
        if (istFeld) await nichtVerdeckt(fokus, leiste)
        if (await page.getByRole('button', { name: haupt }).evaluate((el) => el === document.activeElement)) break
      }
    })
  }
})

// ---------- AK-10: Ladezustand und Doppelklick ----------

test.describe('Ladezustand (AK-10)', () => {
  test('Hauptaktion zeigt aria-busy, behält den Fokus; Doppelklick erzeugt einen Request', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN, { verzoegerung: 800 })
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await page.getByLabel(/^Herausgeber/).fill('Herausgeber Neu')
    const knopf = page.getByRole('button', { name: 'Coin anlegen' })

    await knopf.dblclick()

    await expect(knopf).toHaveAttribute('aria-busy', 'true')
    await expect(knopf).toHaveAttribute('aria-disabled', 'true')
    await expect(knopf).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`/coins/${NEUER_COIN_ID}$`))
    expect(api.schreiben.filter((a) => a.methode === 'POST')).toHaveLength(1)
  })

  test('zweimal Enter in einem Feld erzeugt genau einen Request', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN, { verzoegerung: 800 })
    await oeffne(page, `${DETAIL}/ausgaben/neu`, 'Ausgabe erfassen')
    await page.getByLabel(/^Name des Empfängers/).fill('Testperson A')
    await page.getByLabel(/^Gelegenheit/).fill('Truppenbesuch')
    await page.getByLabel(/^Begründung/).fill('Herausragende Leistung')
    await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Dienststelle Beispiel')

    await page.getByLabel(/^Gelegenheit/).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`${DETAIL}$`))
    expect(api.schreiben.filter((a) => a.methode === 'POST')).toHaveLength(1)
  })
})
