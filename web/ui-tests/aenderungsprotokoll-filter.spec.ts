import { expect, test, type Page } from '@playwright/test'
import { mockeAuditAktionen } from './hilfen/aenderungsprotokoll.js'
import {
  BIS_FEHLER,
  mockeProtokoll,
  PROTOKOLL_EINTRAEGE,
  protokollPanel,
  type ProtokollMock,
} from './hilfen/aenderungsprotokoll-zustaende.js'
import { ADMIN, BETRACHTER, richteApiEin, type ApiZustand } from './hilfen/api.js'
import { erwarteSichtbarenFokus } from './hilfen/pruefungen.js'

// Feature nacharbeiten-audit-filter, AK-12 bis AK-19, AK-23 und AK-28 (UI-Test mit gemockter API, Abschnitt 4.4,
// ADR-0045 Punkt 4): Reiter „Änderungsprotokoll“ mit `reiter=aenderungsprotokoll` per replace, Filter nach Zeitraum,
// Aktion und Benutzer mit Chips und „Filter zurücksetzen“, Filter in der URL (neuer Verlaufseintrag, Neuladen, Zurück),
// nur die GUID des Benutzers in der URL, 400-Feldfehler, Ladefehler der Aktionsliste, Fokus nach „Erneut versuchen“
// und „Audit-Log“ in keinem sichtbaren Text. Browser in America/New_York, damit die Berliner Tagesgrenzen zählen.

test.use({ timezoneId: 'America/New_York' })

let api: ApiZustand
let protokoll: ProtokollMock

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

async function vorbereiten(page: Page, breite = 1280) {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteApiEin(page, ADMIN)
  protokoll = await mockeProtokoll(page)
}

async function oeffne(page: Page, pfad = '/benutzerverwaltung') {
  await vorbereiten(page)
  await page.goto(pfad)
  await expect(page.getByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toBeVisible()
}

async function oeffneProtokoll(page: Page) {
  await oeffne(page)
  await page.getByRole('tab', { name: 'Änderungsprotokoll' }).click()
  await expect(tabelle(page)).toBeVisible()
}

const panel = protokollPanel
const tabelle = (page: Page) => panel(page).getByRole('table', { name: 'Änderungsprotokoll' })
const von = (page: Page) => panel(page).getByLabel(/^Von/)
const bis = (page: Page) => panel(page).getByLabel(/^Bis/)
const checkbox = (page: Page, name: string) => panel(page).getByRole('checkbox', { name })
const chips = (page: Page) => panel(page).getByRole('list', { name: 'Aktive Filter' }).getByRole('listitem')
const zuruecksetzen = (page: Page) => panel(page).getByRole('button', { name: 'Filter zurücksetzen' })
const suche = (page: Page) => new URL(page.url()).searchParams
const zeilen = (page: Page) =>
  tabelle(page)
    .getByRole('row')
    .filter({ hasNot: page.getByRole('columnheader') })

/** Parameter des letzten Abrufs von GET /api/audit, mehrfache als Liste. */
function letzterAbruf(): Record<string, string[]> {
  const query = protokoll.abrufe.at(-1)!.searchParams
  return Object.fromEntries([...new Set(query.keys())].sort().map((k) => [k, query.getAll(k)]))
}

// ---------- AK-19: Kernfall ----------

test.describe('Kernfall (AK-19)', () => {
  test('filtert nach Zeitraum und „Status“ und zeigt Chips und nur passende Einträge', async ({ page }) => {
    await oeffneProtokoll(page)

    await von(page).fill('2026-10-01')
    await bis(page).fill('2026-10-31')
    await checkbox(page, 'Status').check()

    await expect(chips(page)).toHaveText(['Von: 01.10.2026', 'Bis: 31.10.2026', 'Aktion: Status'])
    await expect(zeilen(page)).toHaveCount(1)
    await expect(zeilen(page)).toContainText([BETRACHTER.name])
  })

  test('behält nach dem Neuladen Reiter, Felder, Checkbox, Chips und Einträge', async ({ page }) => {
    await oeffneProtokoll(page)
    await von(page).fill('2026-10-01')
    await bis(page).fill('2026-10-31')
    await checkbox(page, 'Status').check()
    await expect(chips(page)).toHaveCount(3)

    await page.reload()

    await expect(page.getByRole('tab', { name: 'Änderungsprotokoll' })).toHaveAttribute('aria-selected', 'true')
    await expect(von(page)).toHaveValue('2026-10-01')
    await expect(bis(page)).toHaveValue('2026-10-31')
    await expect(checkbox(page, 'Status')).toBeChecked()
    await expect(checkbox(page, 'Rolle')).not.toBeChecked()
    await expect(chips(page)).toHaveText(['Von: 01.10.2026', 'Bis: 31.10.2026', 'Aktion: Status'])
    await expect(zeilen(page)).toHaveCount(1)
  })

  test('zeigt nach „Filter zurücksetzen“ wieder alle Einträge und hat keine Filterparameter mehr in der URL', async ({
    page,
  }) => {
    await oeffneProtokoll(page)
    await von(page).fill('2026-10-01')
    await checkbox(page, 'Status').check()
    await expect(chips(page)).toHaveCount(2)

    await zuruecksetzen(page).click()

    await expect(zeilen(page)).toHaveCount(PROTOKOLL_EINTRAEGE.length)
    await expect.poll(() => ['von', 'bis', 'aktion', 'benutzer', 'seite'].filter((p) => suche(page).has(p))).toEqual([])
    expect(suche(page).get('reiter')).toBe('aenderungsprotokoll')
  })

  test('lädt nach „Filter zurücksetzen“ ohne Filter ab Seite 1', async ({ page }) => {
    await oeffneProtokoll(page)
    await checkbox(page, 'Status').check()
    await expect(chips(page)).toHaveCount(1)

    await zuruecksetzen(page).click()

    await expect.poll(() => letzterAbruf()).toEqual({ groesse: ['25'], seite: ['1'] })
  })

  test('setzt nach „Filter zurücksetzen“ den Fokus auf „Von“', async ({ page }) => {
    await oeffneProtokoll(page)
    await checkbox(page, 'Rolle').check()
    await expect(chips(page)).toHaveCount(1)

    await zuruecksetzen(page).click()

    await expect(von(page)).toBeFocused()
  })
})

// ---------- AK-12: Reiter in der URL ----------

test.describe('Reiter (AK-12)', () => {
  test('heißt „Benutzer“ und „Änderungsprotokoll“', async ({ page }) => {
    await oeffne(page)

    await expect(page.getByRole('tab')).toHaveText(['Benutzer', 'Änderungsprotokoll'])
  })

  test('setzt beim Wechsel reiter=aenderungsprotokoll per replace', async ({ page }) => {
    await oeffne(page)
    const laenge = await page.evaluate(() => history.length)

    await page.getByRole('tab', { name: 'Änderungsprotokoll' }).click()

    await expect.poll(() => suche(page).get('reiter')).toBe('aenderungsprotokoll')
    expect(await page.evaluate(() => history.length)).toBe(laenge)
  })

  test('entfernt reiter beim Wechsel zurück auf „Benutzer“', async ({ page }) => {
    await oeffneProtokoll(page)

    await page.getByRole('tab', { name: 'Benutzer' }).click()

    await expect.poll(() => suche(page).has('reiter')).toBe(false)
  })

  test('zeigt nach dem Neuladen mit ?reiter=aenderungsprotokoll den Reiter aktiv', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung?reiter=aenderungsprotokoll')

    await expect(page.getByRole('tab', { name: 'Änderungsprotokoll' })).toHaveAttribute('aria-selected', 'true')
    await expect(tabelle(page)).toBeVisible()
  })

  test('zeigt bei unbekanntem Reiter den Reiter „Benutzer“', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung?reiter=unbekannt')

    await expect(page.getByRole('tab', { name: 'Benutzer' })).toHaveAttribute('aria-selected', 'true')
  })
})

// ---------- AK-13: Bedienelemente ----------

test.describe('Bedienelemente (AK-13)', () => {
  test('hat die Gruppe „Zeitraum“ mit „Von“ und „Bis“ als Datumsfelder', async ({ page }) => {
    await oeffneProtokoll(page)

    const gruppe = panel(page).getByRole('group', { name: 'Zeitraum' })
    await expect(gruppe).toBeVisible()
    await expect(gruppe.getByLabel(/^Von/)).toHaveAttribute('type', 'date')
    await expect(gruppe.getByLabel(/^Bis/)).toHaveAttribute('type', 'date')
  })

  test('beschreibt den Zeitraum mit „Ganze Tage nach deutscher Zeit, höchstens 366 Tage.“', async ({ page }) => {
    await oeffneProtokoll(page)

    await expect(panel(page).getByRole('group', { name: 'Zeitraum' })).toContainText(
      'Ganze Tage nach deutscher Zeit, höchstens 366 Tage.',
    )
  })

  test('hat die Gruppe „Aktion“ mit den Checkboxen aus GET /api/audit/aktionen', async ({ page }) => {
    await oeffneProtokoll(page)

    await expect(
      panel(page)
        .getByRole('group', { name: /^Aktion/ })
        .getByRole('checkbox'),
    ).toHaveCount(2)
    await expect(checkbox(page, 'Rolle')).toBeVisible()
    await expect(checkbox(page, 'Status')).toBeVisible()
  })

  test('hat genau eine Combobox, „Benutzer“', async ({ page }) => {
    await oeffneProtokoll(page)

    await expect(panel(page).getByRole('combobox')).toHaveCount(1)
    await expect(panel(page).getByRole('combobox', { name: /^Benutzer/ })).toBeVisible()
  })

  test('erreicht Von, Bis, Rolle, Status und Benutzer per Tab in dieser Reihenfolge', async ({ page }) => {
    await oeffneProtokoll(page)
    await von(page).focus()

    // Das native Datumsfeld hat in Chromium je Teil (Tag, Monat, Jahr) einen eigenen Tab-Stopp; aufeinanderfolgende
    // Stopps im selben Feld zählen als ein Feld. Geprüft wird die Reihenfolge der Felder.
    const felder: string[] = []
    for (let i = 0; i < 15 && felder.length < 5; i++) {
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const id = el?.id
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null
        return (el?.getAttribute('aria-label') ?? label ?? el?.textContent ?? '').trim().split(/\s/)[0]
      })
      if (felder.at(-1) !== name) felder.push(name)
      await page.keyboard.press('Tab')
    }

    expect(felder).toEqual(['Von', 'Bis', 'Rolle', 'Status', 'Benutzer'])
  })

  test('schaltet eine Checkbox per Leertaste und lädt mit aktion', async ({ page }) => {
    await oeffneProtokoll(page)
    await checkbox(page, 'Status').focus()

    await page.keyboard.press('Space')

    await expect(checkbox(page, 'Status')).toBeChecked()
    await expect.poll(() => protokoll.abrufe.at(-1)?.searchParams.getAll('aktion')).toEqual(['Status'])
  })

  test('hat Datumsfelder mit mindestens 40 px Höhe', async ({ page }) => {
    await oeffneProtokoll(page)

    for (const feld of [von(page), bis(page)]) {
      expect((await feld.boundingBox())!.height).toBeGreaterThanOrEqual(40)
    }
  })

  test('hat je Checkbox eine Klickfläche von mindestens 40 × 40 px', async ({ page }) => {
    await oeffneProtokoll(page)

    for (const name of ['Rolle', 'Status']) {
      const flaeche = await checkbox(page, name).evaluate((el) => {
        const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label')
        const boxen = [el, label].filter((x): x is Element => x !== null).map((x) => x.getBoundingClientRect())
        const links = Math.min(...boxen.map((b) => b.left))
        const rechts = Math.max(...boxen.map((b) => b.right))
        return { breite: rechts - links, hoehe: Math.max(...boxen.map((b) => b.height)) }
      })
      expect(flaeche.hoehe, name).toBeGreaterThanOrEqual(40)
      expect(flaeche.breite, name).toBeGreaterThanOrEqual(40)
    }
  })
})

// ---------- AK-14: Wirkung und URL ----------

test.describe('Wirkung und URL (AK-14)', () => {
  test('lädt nach „Von“ mit seite=1, groesse=25 und von', async ({ page }) => {
    await oeffneProtokoll(page)

    await von(page).fill('2026-10-01')

    await expect.poll(() => letzterAbruf()).toEqual({ groesse: ['25'], seite: ['1'], von: ['2026-10-01'] })
  })

  test('sendet bei zwei Aktionen je einen Parameter aktion', async ({ page }) => {
    await oeffneProtokoll(page)

    await checkbox(page, 'Status').check()
    await checkbox(page, 'Rolle').check()

    await expect.poll(() => protokoll.abrufe.at(-1)?.searchParams.getAll('aktion')).toEqual(['Rolle', 'Status'])
  })

  test('schreibt von, bis, aktion (kommagetrennt) und reiter in die URL', async ({ page }) => {
    await oeffneProtokoll(page)

    await von(page).fill('2026-10-01')
    await bis(page).fill('2026-10-31')
    await checkbox(page, 'Status').check()
    await checkbox(page, 'Rolle').check()

    await expect
      .poll(() => Object.fromEntries(suche(page)))
      .toEqual({ reiter: 'aenderungsprotokoll', von: '2026-10-01', bis: '2026-10-31', aktion: 'Rolle,Status' })
  })

  // QA-Runde 1 W2 (AK-14): Beim Eintippen des Jahres liefert das native Datumsfeld Zwischenwerte wie 0002-10-01,
  // 0020-10-01 und 0202-10-01. Sie dürfen weder einen Request noch einen Verlaufseintrag auslösen.
  test.describe('Eintippen eines Datums per Tastatur (W2)', () => {
    async function tippeVon(page: Page) {
      await oeffneProtokoll(page)
      await von(page).focus()
      // Reihenfolge der Teile im deutschen Gebietsschema: Tag, Monat, Jahr.
      await von(page).pressSequentially('01102026', { delay: 50 })
      await expect(von(page)).toHaveValue('2026-10-01')
    }

    test('lädt höchstens einmal mit von, und zwar mit dem vollständigen Datum', async ({ page }) => {
      await tippeVon(page)

      await expect.poll(() => protokoll.abrufe.at(-1)?.searchParams.get('von')).toBe('2026-10-01')
      const mitVon = protokoll.abrufe.map((u) => u.searchParams.get('von')).filter((v) => v !== null)
      expect(mitVon).toEqual(['2026-10-01'])
    })

    test('fragt nie mit einem Jahr vor 2000 an', async ({ page }) => {
      await tippeVon(page)

      await expect.poll(() => protokoll.abrufe.at(-1)?.searchParams.get('von')).toBe('2026-10-01')
      const jahre = protokoll.abrufe
        .map((u) => u.searchParams.get('von'))
        .filter((v): v is string => v !== null)
        .map((v) => Number(v.slice(0, 4)))
      expect(jahre.filter((j) => j < 2000)).toEqual([])
    })

    test('zeigt keinen Feldfehler', async ({ page }) => {
      await tippeVon(page)

      await expect(chips(page)).toHaveText(['Von: 01.10.2026'])
      await expect(von(page)).not.toHaveAttribute('aria-invalid', 'true')
      await expect(panel(page).getByText('Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.')).toHaveCount(0)
    })

    test('führt mit der Zurück-Schaltfläche in einem Schritt zum Zustand ohne Datum', async ({ page }) => {
      await tippeVon(page)
      await expect.poll(() => suche(page).get('von')).toBe('2026-10-01')

      await page.goBack()

      await expect.poll(() => suche(page).has('von')).toBe(false)
      expect(suche(page).get('reiter')).toBe('aenderungsprotokoll')
      await expect(von(page)).toHaveValue('')
      await expect(panel(page).getByRole('list', { name: 'Aktive Filter' })).toHaveCount(0)
    })
  })

  test('legt je Filteränderung einen neuen Verlaufseintrag an', async ({ page }) => {
    await oeffneProtokoll(page)
    const laenge = await page.evaluate(() => history.length)

    await checkbox(page, 'Status').check()

    await expect.poll(() => page.evaluate(() => history.length)).toBe(laenge + 1)
  })

  test('schreibt beim Benutzerfilter nur die GUID in die URL, nie Name oder E-Mail', async ({ page }) => {
    await oeffneProtokoll(page)
    const feld = panel(page).getByRole('combobox', { name: /^Benutzer/ })
    await page.route(
      (url) => url.pathname === '/api/benutzer' && url.searchParams.get('groesse') === '20',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            eintraege: [
              {
                id: BETRACHTER.id,
                name: BETRACHTER.name,
                email: BETRACHTER.email,
                rolle: 'Betrachter',
                aktiv: true,
                erstelltAm: '2026-10-02T08:00:00Z',
              },
            ],
            gesamt: 1,
            seite: 1,
            groesse: 20,
          }),
        }),
    )
    await feld.click()
    await feld.pressSequentially('Betr')
    await page.getByRole('option', { name: BETRACHTER.name }).click()

    await expect.poll(() => suche(page).get('benutzer')).toBe(BETRACHTER.id)
    expect(decodeURIComponent(page.url())).not.toContain(BETRACHTER.name)
    expect(decodeURIComponent(page.url())).not.toContain(BETRACHTER.email)
  })

  test('legt keine Filterwerte im Browser-Speicher ab', async ({ page }) => {
    await oeffneProtokoll(page)
    await von(page).fill('2026-10-01')
    await checkbox(page, 'Status').check()
    await expect(chips(page)).toHaveCount(2)

    const speicher = await page.evaluate(() => ({ lokal: { ...localStorage }, sitzung: Object.keys(sessionStorage) }))

    expect(Object.keys(speicher.lokal).filter((k) => !['coin-theme', 'coin-katalog-ansicht'].includes(k))).toEqual([])
    expect(JSON.stringify(speicher)).not.toMatch(/2026-10-01|aenderungsprotokoll/)
  })
})

// ---------- AK-15: Chips ----------

test.describe('Chips (AK-15)', () => {
  test('entfernt per Chip nur diesen Filter und lädt ab Seite 1', async ({ page }) => {
    await oeffneProtokoll(page)
    await von(page).fill('2026-10-01')
    await checkbox(page, 'Status').check()
    await expect(chips(page)).toHaveCount(2)

    await panel(page).getByRole('button', { name: 'Filter „Aktion: Status“ entfernen' }).click()

    await expect(chips(page)).toHaveText(['Von: 01.10.2026'])
    await expect.poll(() => letzterAbruf()).toEqual({ groesse: ['25'], seite: ['1'], von: ['2026-10-01'] })
  })

  test('zeigt „Filter zurücksetzen“ schon ab einem Chip', async ({ page }) => {
    await oeffneProtokoll(page)

    await checkbox(page, 'Rolle').check()

    await expect(zuruecksetzen(page)).toBeVisible()
  })
})

// ---------- AK-16: URL wiederherstellen und Zurück ----------

test.describe('URL wiederherstellen (AK-16)', () => {
  const PFAD = '/benutzerverwaltung?reiter=aenderungsprotokoll&von=2026-10-01&bis=2026-10-31&aktion=Status'

  test('zeigt Reiter, Feldwerte, Checkbox und Chips aus der URL', async ({ page }) => {
    await oeffne(page, PFAD)

    await expect(page.getByRole('tab', { name: 'Änderungsprotokoll' })).toHaveAttribute('aria-selected', 'true')
    await expect(von(page)).toHaveValue('2026-10-01')
    await expect(bis(page)).toHaveValue('2026-10-31')
    await expect(checkbox(page, 'Status')).toBeChecked()
    await expect(chips(page)).toHaveText(['Von: 01.10.2026', 'Bis: 31.10.2026', 'Aktion: Status'])
  })

  test('lädt genau mit den Parametern aus der URL', async ({ page }) => {
    await oeffne(page, PFAD)
    await expect(chips(page)).toHaveCount(3)

    expect(letzterAbruf()).toEqual({
      aktion: ['Status'],
      bis: ['2026-10-31'],
      groesse: ['25'],
      seite: ['1'],
      von: ['2026-10-01'],
    })
  })

  test('stellt mit der Zurück-Schaltfläche den vorigen Filterstand samt Request wieder her', async ({ page }) => {
    await oeffne(page, PFAD)
    await expect(chips(page)).toHaveCount(3)
    await checkbox(page, 'Rolle').check()
    await expect(chips(page)).toHaveCount(4)

    await page.goBack()

    await expect(chips(page)).toHaveText(['Von: 01.10.2026', 'Bis: 31.10.2026', 'Aktion: Status'])
    await expect(checkbox(page, 'Rolle')).not.toBeChecked()
    await expect.poll(() => protokoll.abrufe.at(-1)?.searchParams.getAll('aktion')).toEqual(['Status'])
  })

  test('nennt den Benutzer aus der URL mit dem Namen des ersten Eintrags', async ({ page }) => {
    await oeffne(page, `/benutzerverwaltung?reiter=aenderungsprotokoll&benutzer=${BETRACHTER.id}`)

    await expect(chips(page)).toHaveText([`Benutzer: ${BETRACHTER.name}`])
    await expect(panel(page).getByRole('combobox', { name: /^Benutzer/ })).toHaveValue(BETRACHTER.name)
  })

  test('nennt einen Benutzer ohne Einträge „unbekannt“', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung?reiter=aenderungsprotokoll&benutzer=0199a1b2-0000-7000-8000-00000000beef')

    await expect(chips(page)).toHaveText(['Benutzer: unbekannt'])
  })

  test('lässt eine ungültige Benutzerangabe in der URL weg und lädt ohne benutzerId', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung?reiter=aenderungsprotokoll&benutzer=Test%20Betrachter')
    await expect(tabelle(page)).toBeVisible()

    expect(protokoll.abrufe.at(-1)?.searchParams.has('benutzerId')).toBe(false)
  })
})

// ---------- AK-17, AK-18: 400, Aktionsliste, Leerzustand ----------

test.describe('Fehler und Leerzustand (AK-17, AK-18)', () => {
  test('zeigt den 400-Fehler am Feld „Bis“ ohne Tabelle und ohne „Erneut versuchen“', async ({ page }) => {
    await vorbereiten(page)
    protokoll.feldfehler(99, { bis: [BIS_FEHLER] })
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll&von=2026-10-31&bis=2026-10-01')

    await expect(bis(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(bis(page)).toHaveAccessibleDescription(new RegExp(BIS_FEHLER))
    await expect(tabelle(page)).toHaveCount(0)
    await expect(panel(page).getByRole('button', { name: 'Erneut versuchen' })).toHaveCount(0)
    await expect(panel(page).getByRole('navigation')).toHaveCount(0)
  })

  test('zeigt bei fehlender Aktionsliste „Aktionen konnten nicht geladen werden.“ in der Gruppe', async ({ page }) => {
    await vorbereiten(page)
    await mockeAuditAktionen(page, { fehler: true })
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll')

    await expect(panel(page).getByRole('group', { name: /^Aktion/ })).toContainText(
      'Aktionen konnten nicht geladen werden.',
    )
    await expect(tabelle(page)).toBeVisible()
  })

  test('lässt bei fehlender Aktionsliste den Zeitraumfilter wirken', async ({ page }) => {
    await vorbereiten(page)
    await mockeAuditAktionen(page, { fehler: true })
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll')
    await expect(panel(page).getByText('Aktionen konnten nicht geladen werden.')).toBeVisible()

    await von(page).fill('2026-10-01')

    await expect.poll(() => protokoll.abrufe.at(-1)?.searchParams.get('von')).toBe('2026-10-01')
  })

  test('zeigt mit Filter ohne Treffer h3 „Keine Einträge für diese Filter.“ und setzt per Button zurück', async ({
    page,
  }) => {
    await oeffne(page, '/benutzerverwaltung?reiter=aenderungsprotokoll&von=2027-01-01')
    await expect(panel(page).getByRole('heading', { level: 3, name: 'Keine Einträge für diese Filter.' })).toBeVisible()

    // Den Button gibt es zweimal (Filterleiste ab einem Chip und Leerzustand); der Leerzustand steht im DOM danach.
    await zuruecksetzen(page).last().click()

    await expect(zeilen(page)).toHaveCount(PROTOKOLL_EINTRAEGE.length)
    await expect(von(page)).toBeFocused()
  })
})

// ---------- AK-28: Fokus nach „Erneut versuchen“ ----------

test.describe('Fokus nach „Erneut versuchen“ (AK-28)', () => {
  test('setzt den Fokus per Enter in den Inhaltsbereich des Protokolls mit sichtbarem Fokusring', async ({ page }) => {
    await vorbereiten(page)
    protokoll.fehler(99)
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll')
    const knopf = panel(page).getByRole('button', { name: 'Erneut versuchen' })
    await expect(knopf).toBeVisible()
    protokoll.fehler(0)

    await knopf.focus()
    await page.keyboard.press('Enter')

    await expect(tabelle(page)).toBeVisible()
    const ziel = await page.evaluate(() => ({
      body: document.activeElement === document.body,
      imPanel: document.activeElement?.closest('[role="tabpanel"]') !== null,
    }))
    expect(ziel).toEqual({ body: false, imPanel: true })
    await erwarteSichtbarenFokus(page)
  })

  test('lässt den Fokus bei erneutem Fehler im Inhaltsbereich und zeigt den Alarm', async ({ page }) => {
    await vorbereiten(page)
    protokoll.fehler(99)
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll')
    await expect(panel(page).getByRole('button', { name: 'Erneut versuchen' })).toBeVisible()

    await panel(page).getByRole('button', { name: 'Erneut versuchen' }).focus()
    await page.keyboard.press('Enter')

    await expect(panel(page).getByRole('alert')).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.closest('[role="tabpanel"]') !== null)).toBe(true)
  })
})

// ---------- AK-23: kein „Audit-Log“ ----------

/** Sichtbarer Text samt aria-label, title, alt, placeholder und Captions der Seite. */
async function oberflaechentext(page: Page): Promise<string> {
  return page.evaluate(() => {
    const attribute = [...document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    const captions = [...document.querySelectorAll('caption')].map((c) => c.textContent ?? '')
    return [document.body.innerText, document.title, ...attribute, ...captions].join(' ')
  })
}

test.describe('Kein „Audit-Log“ in der Oberfläche (AK-23)', () => {
  test('im Reiter „Benutzer“', async ({ page }) => {
    await oeffne(page)
    await expect(page.getByRole('tab', { name: 'Benutzer' })).toHaveAttribute('aria-selected', 'true')

    expect(await oberflaechentext(page)).not.toContain('Audit-Log')
  })

  test('im Änderungsprotokoll mit Filtern', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung?reiter=aenderungsprotokoll&von=2026-10-01&aktion=Status')
    await expect(chips(page)).toHaveCount(2)

    expect(await oberflaechentext(page)).not.toContain('Audit-Log')
  })

  test('im Änderungsprotokoll leer mit Filter', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung?reiter=aenderungsprotokoll&von=2027-01-01')
    await expect(panel(page).getByRole('heading', { level: 3, name: 'Keine Einträge für diese Filter.' })).toBeVisible()

    expect(await oberflaechentext(page)).not.toContain('Audit-Log')
  })

  test('im Änderungsprotokoll mit Ladefehler', async ({ page }) => {
    await vorbereiten(page)
    protokoll.fehler(99)
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll')
    await expect(panel(page).getByRole('alert')).toBeVisible()

    expect(await oberflaechentext(page)).not.toContain('Audit-Log')
  })

  test('nennt Lade- und Fehlertext „Änderungsprotokoll …“', async ({ page }) => {
    await vorbereiten(page)
    protokoll.fehler(99)
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll')

    await expect(panel(page).getByRole('alert')).toContainText(
      'Änderungsprotokoll konnte nicht geladen werden. Bitte später erneut versuchen.',
    )
  })

  test('zeigt den Systemakteur als „System (Ersteinrichtung)“', async ({ page }) => {
    await oeffneProtokoll(page)

    await expect(tabelle(page)).toContainText('System (Ersteinrichtung)')
  })
})
