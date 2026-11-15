import { expect, test, type Page } from '@playwright/test'
import { ADMIN, richteApiEin, scrolltNichtHorizontal, type ApiZustand } from './hilfen/api.js'
import { BETRACHTER, mockeAudit, oeffneAuditLog, type AuditZustand } from './hilfen/uebersicht.js'

// Feature startseite-listen-pruefung, AK-28 bis AK-31 (Abschnitt 4.4, F5 Variante A; UI-Test mit gemockter API):
// einheitlicher Aufbau von Benutzerverwaltung und Startseite verwalten (Seitenkopf mit Beschreibung, Reiter, Panel-h2),
// Audit-Benutzerfilter (geänderter Benutzer, Suche verzögert, nur Namen, Chip, nichts in der URL), Zeitpunkte in
// Europe/Berlin mit „Uhr“ (Browser in America/New_York), Zustände mit „Erneut versuchen“ und Leerzuständen.

test.use({ timezoneId: 'America/New_York' })

let api: ApiZustand
let audit: AuditZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

async function oeffne(page: Page, pfad: string, { breite = 1280, leer = false, fehler = 0 } = {}) {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteApiEin(page, ADMIN)
  audit = await mockeAudit(page, { leer, fehler })
  await page.goto(pfad)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** Überschriften in main als Ebenen in DOM-Reihenfolge (sichtbar). */
async function ebenen(page: Page): Promise<number[]> {
  return page
    .getByRole('main')
    .evaluate((main) =>
      [...main.querySelectorAll<HTMLElement>('h1, h2, h3, h4')]
        .filter((h) => h.offsetParent !== null)
        .map((h) => Number(h.tagName.slice(1))),
    )
}

const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Audit-Log' })
const filterFeld = (page: Page) => panel(page).getByRole('combobox', { name: /^Benutzer/ })

// ---------- AK-28: Aufbau ----------

test.describe('Aufbau Benutzerverwaltung (AK-28)', () => {
  test('zeigt im Seitenkopf die Beschreibung aus 4.4 und darunter die Reiter', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')

    const beschreibung = page.getByText('Rollen vergeben, Benutzer deaktivieren und Änderungen nachvollziehen.')
    await expect(beschreibung).toBeVisible()
    const reiter = (await page.getByRole('tablist').boundingBox())!
    expect((await beschreibung.boundingBox())!.y).toBeLessThan(reiter.y)
    await expect(page.getByRole('tab')).toHaveText(['Benutzer', 'Audit-Log'])
  })

  test('gibt dem Panel „Benutzer“ die h2 „Benutzer“', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')

    await expect(
      page
        .getByRole('tabpanel', { name: 'Benutzer' })
        .getByRole('heading', { level: 2, name: 'Benutzer', exact: true }),
    ).toBeVisible()
  })

  test('gibt dem Panel „Audit-Log“ die h2 „Änderungsprotokoll“', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')

    await page.getByRole('tab', { name: 'Audit-Log' }).click()

    await expect(panel(page).getByRole('heading', { level: 2, name: 'Änderungsprotokoll' })).toBeVisible()
  })

  for (const breite of [360, 1280]) {
    test(`lässt bei ${breite} px keine h3 direkt auf die h1 folgen und springt nicht`, async ({ page }) => {
      await oeffne(page, '/benutzerverwaltung', { breite })
      await expect(page.getByRole('status').filter({ hasText: 'Benutzer gefunden' })).toBeVisible()

      const liste = await ebenen(page)
      expect(liste[0]).toBe(1)
      expect(
        liste.slice(1).every((e, i) => e <= liste[i] + 1),
        `Ebenen ${liste.join(' → ')}`,
      ).toBe(true)
    })
  }
})

test.describe('Aufbau Startseite verwalten (AK-28)', () => {
  test('zeigt ohne gespeicherte Konfiguration die Beschreibung aus 4.4 über den Reitern', async ({ page }) => {
    await oeffne(page, '/verwaltung/startseite')

    const beschreibung = page.getByText('Blöcke der Startseite ein- und ausschalten, ordnen und mit Inhalt füllen.')
    await expect(beschreibung).toBeVisible()
    expect((await beschreibung.boundingBox())!.y).toBeLessThan((await page.getByRole('tablist').boundingBox())!.y)
    await expect(page.getByRole('tab')).toHaveText(['Bearbeiten', 'Vorschau'])
  })

  test('zeigt „Zuletzt gespeichert am“ als „TT.MM.JJJJ, HH:MM Uhr“ in Europe/Berlin', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    api = await richteApiEin(page, ADMIN)
    await page.route(
      (url) => url.pathname === '/api/startseite/konfiguration',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            version: 3,
            standard: false,
            geaendertAm: '2026-01-31T23:05:00Z',
            geaendertVon: 'Test Administrator',
            reihenfolge: ['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben'],
            kopf: {
              aktiv: false,
              titel: 'C.O.I.N.',
              untertitel: 'Certified Official Issue Numbering',
              logoBereitsteller: null,
              logoSoftware: null,
            },
            infotext: { aktiv: true, text: 'Synthetischer Infotext.' },
            kennzahlen: { aktiv: true },
            neueste: { aktiv: true, anzahl: 6 },
            meistausgegeben: { aktiv: true, anzahl: 5 },
            daten: {
              kennzahlen: { coins: 1, exemplare: 10, ausgegeben: 1, verfuegbar: 9 },
              neueste: [],
              meistausgegeben: [],
            },
          }),
        })
      },
    )
    await page.goto('/verwaltung/startseite')

    await expect(page.getByText('Zuletzt gespeichert am 01.02.2026, 00:05 Uhr von Test Administrator')).toBeVisible()
  })

  test('lässt keine h3 direkt auf die h1 folgen (Reiter „Vorschau“)', async ({ page }) => {
    await oeffne(page, '/verwaltung/startseite')
    await page.getByRole('tab', { name: 'Vorschau' }).click()
    await expect(page.getByRole('region', { name: 'Vorschau der Startseite' })).toBeVisible()

    const liste = await ebenen(page)
    expect(liste[0]).toBe(1)
    expect(
      liste.slice(1).every((e, i) => e <= liste[i] + 1),
      `Ebenen ${liste.join(' → ')}`,
    ).toBe(true)
  })
})

// ---------- AK-29: Audit-Benutzerfilter ----------

test.describe('Audit-Log: Benutzerfilter (AK-29)', () => {
  test('hat genau einen Filter, die Combobox „Benutzer“ mit dem Hilfetext', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    await expect(panel(page).getByRole('combobox')).toHaveCount(1)
    await expect(filterFeld(page)).toHaveAccessibleDescription(/Zeigt Änderungen an diesem Benutzerkonto\./)
  })

  test('sucht nach der Eingabe verzögert über GET /api/benutzer?suche=…&groesse=20', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    await filterFeld(page).click()
    await filterFeld(page).pressSequentially('Betr')

    await expect.poll(() => audit.suchen.length).toBeGreaterThan(0)
    expect(audit.suchen.at(-1)?.searchParams.get('suche')).toBe('Betr')
    expect(audit.suchen.at(-1)?.searchParams.get('groesse')).toBe('20')
    // Verzögert: nicht schon für jeden Zwischenstand („B“, „Be“, …).
    expect(audit.suchen.map((u) => u.searchParams.get('suche'))).not.toContain('B')
  })

  test('zeigt die Treffer nur mit Namen, ohne E-Mail', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    await filterFeld(page).click()
    await filterFeld(page).pressSequentially('Test')

    const optionen = page.getByRole('option')
    await expect(optionen.first()).toBeVisible()
    for (const text of await optionen.allTextContents()) expect(text).not.toMatch(/@/)
  })

  test('lädt nach der Wahl mit benutzerId und seite=1 und zeigt den Chip „Benutzer: {Name}“', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    await filterFeld(page).click()
    await filterFeld(page).pressSequentially('Betr')
    await page.getByRole('option', { name: BETRACHTER.name }).click()

    await expect(panel(page).getByRole('list', { name: 'Aktive Filter' }).getByRole('listitem')).toHaveText([
      `Benutzer: ${BETRACHTER.name}`,
    ])
    const letzter = audit.abrufe.at(-1)!
    expect(letzter.searchParams.get('benutzerId')).toBe(BETRACHTER.id)
    expect(letzter.searchParams.get('seite')).toBe('1')
    expect([...letzter.searchParams.keys()].sort()).toEqual(['benutzerId', 'groesse', 'seite'])
  })

  test('setzt weder Namen noch Id des Benutzers in die URL', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    await filterFeld(page).click()
    await filterFeld(page).pressSequentially('Betr')
    await page.getByRole('option', { name: BETRACHTER.name }).click()
    await expect(panel(page).getByRole('list', { name: 'Aktive Filter' })).toBeVisible()

    expect(decodeURIComponent(page.url())).not.toContain(BETRACHTER.name)
    expect(page.url()).not.toContain(BETRACHTER.id)
  })

  test('lädt nach dem Entfernen des Chips ohne benutzerId ab Seite 1', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)
    await filterFeld(page).click()
    await filterFeld(page).pressSequentially('Betr')
    await page.getByRole('option', { name: BETRACHTER.name }).click()
    await expect(panel(page).getByRole('list', { name: 'Aktive Filter' })).toBeVisible()

    await page.getByRole('button', { name: `Filter „Benutzer: ${BETRACHTER.name}“ entfernen` }).click()

    await expect(panel(page).getByRole('list', { name: 'Aktive Filter' })).toHaveCount(0)
    await expect.poll(() => audit.abrufe.at(-1)?.searchParams.has('benutzerId')).toBe(false)
    expect(audit.abrufe.at(-1)?.searchParams.get('seite')).toBe('1')
  })

  test('bietet keinen Filter nach Zeitraum oder Aktion', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    for (const name of [/Zeitraum/, /^Von\b/, /^Bis\b/, /Aktion/]) {
      await expect(panel(page).getByRole('combobox', { name })).toHaveCount(0)
      await expect(panel(page).getByRole('textbox', { name })).toHaveCount(0)
    }
  })
})

// ---------- AK-30: Zeitpunkte ----------

test.describe('Audit-Log: Zeitpunkte (AK-30)', () => {
  test('zeigt Zeitpunkte als „TT.MM.JJJJ, HH:MM Uhr“ in Europe/Berlin, mit Sekunden im title', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    const zeit = panel(page).locator('time').first()
    await expect(zeit).toHaveText('03.10.2026, 11:00 Uhr')
    await expect(zeit).toHaveAttribute('datetime', '2026-10-03T09:00:00Z')
    await expect(zeit).toHaveAttribute('title', '03.10.2026, 11:00:00 Uhr')
  })

  test('rechnet auch in der Winterzeit über den Tageswechsel nach Europe/Berlin um', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)

    await expect(panel(page).locator('time').nth(1)).toHaveText('01.02.2026, 00:05 Uhr')
  })
})

// ---------- AK-31: Zustände ----------

test.describe('Audit-Log und Benutzer: Zustände (AK-31)', () => {
  test('Audit-Log: Fehler mit „Erneut versuchen“ lädt neu und zeigt die Tabelle', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung', { fehler: 99 })
    await oeffneAuditLog(page)
    const alarm = panel(page).getByRole('alert')
    await expect(alarm).toContainText('Audit-Log konnte nicht geladen werden. Bitte später erneut versuchen.')

    audit.fehlerBeheben()
    await alarm.getByRole('button', { name: 'Erneut versuchen' }).click()

    await expect(panel(page).getByRole('table', { name: 'Audit-Log' })).toBeVisible()
  })

  test('Audit-Log: leer ohne Filter zeigt h3 „Noch keine Einträge.“', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung', { leer: true })
    await oeffneAuditLog(page)

    await expect(panel(page).getByRole('heading', { level: 3, name: 'Noch keine Einträge.' })).toBeVisible()
  })

  test('Audit-Log: leer mit Filter zeigt h3 „Keine Einträge für diesen Benutzer.“ und „Filter entfernen“', async ({
    page,
  }) => {
    await oeffne(page, '/benutzerverwaltung')
    await oeffneAuditLog(page)
    await filterFeld(page).click()
    await filterFeld(page).pressSequentially('Testperson')

    await page.getByRole('option', { name: 'Testperson A' }).click()

    await expect(
      panel(page).getByRole('heading', { level: 3, name: 'Keine Einträge für diesen Benutzer.' }),
    ).toBeVisible()
    await panel(page).getByRole('button', { name: 'Filter entfernen' }).click()
    await expect(panel(page).getByRole('table', { name: 'Audit-Log' })).toBeVisible()
  })

  test('Benutzer: Fehler mit „Erneut versuchen“ lädt neu und zeigt die Tabelle', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    api = await richteApiEin(page, ADMIN)
    // Fehler bis zum Klick auf „Erneut versuchen“ (der Dev-Server lädt im StrictMode doppelt).
    let fehler = true
    await page.route(
      (url) => url.pathname === '/api/benutzer' && url.searchParams.get('groesse') === '25',
      async (route) => {
        if (fehler) {
          return route.fulfill({
            status: 500,
            contentType: 'application/problem+json',
            body: JSON.stringify({ title: 'Fehler', status: 500 }),
          })
        }
        return route.fallback()
      },
    )
    await page.goto('/benutzerverwaltung')
    const alarm = page.getByRole('alert').filter({ hasText: 'Benutzer konnten nicht geladen werden.' })
    await expect(alarm).toBeVisible()

    fehler = false
    await alarm.getByRole('button', { name: 'Erneut versuchen' }).click()

    await expect(page.getByRole('table', { name: 'Benutzer' })).toBeVisible()
  })

  test('Benutzer: leeres Suchergebnis zeigt einen Leerzustand mit „Suche zurücksetzen“', async ({ page }) => {
    await oeffne(page, '/benutzerverwaltung')
    // Der Lese-Mock aus hilfen/api.ts ignoriert `suche`; hier liefert eine Suche ohne Treffer eine leere Seite.
    await page.route(
      (url) => url.pathname === '/api/benutzer' && url.searchParams.get('groesse') === '25',
      (route) => {
        const url = new URL(route.request().url())
        if (!(url.searchParams.get('suche') ?? '').trim()) return route.fallback()
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ eintraege: [], gesamt: 0, seite: 1, groesse: 25 }),
        })
      },
    )
    await page.getByRole('searchbox', { name: /^Benutzer suchen/ }).fill('gibtesnicht')
    await page.getByRole('button', { name: 'Suchen', exact: true }).click()

    await page.getByRole('button', { name: 'Suche zurücksetzen' }).click()

    await expect(page.getByRole('table', { name: 'Benutzer' })).toBeVisible()
  })

  for (const breite of [360, 768, 1280]) {
    test(`scrollt mit aktivem Audit-Filter bei ${breite} px nicht horizontal`, async ({ page }) => {
      await oeffne(page, '/benutzerverwaltung', { breite })
      await oeffneAuditLog(page)
      await filterFeld(page).click()
      await filterFeld(page).pressSequentially('Betr')
      await page.getByRole('option', { name: BETRACHTER.name }).click()
      await expect(panel(page).getByRole('list', { name: 'Aktive Filter' })).toBeVisible()

      await scrolltNichtHorizontal(page)
    })
  }
})
