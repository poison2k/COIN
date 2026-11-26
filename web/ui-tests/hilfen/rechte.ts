import { expect, type Page } from '@playwright/test'
import { ADMIN, BETRACHTER, HOLOGRAMMNUMMER, OHNE_ROLLE, richteApiEin, type ApiZustand, type Me } from './api.js'
import { SACHBEARBEITER } from './uebersicht.js'

// Hilfen für den UI-Test „Berechtigungen unverändert“ (startseite-listen-pruefung, AK-39): je Rolle und Seite die
// Namen der Bedienelemente (Links, Buttons, Reiter, Regionen in main und Links der Hauptnavigation) und die
// aufgerufenen Endpunkte. Anonyme Besucher werden auf geschützten Seiten zur Anmeldung geleitet (Authorize-Endpunkt).

export const AUTHORIZE = 'http://127.0.0.1:9/realms/coin/protocol/openid-connect/auth'

export const ROLLEN: ReadonlyArray<[string, Me | null]> = [
  ['anonym', null],
  ['ohne Rolle', OHNE_ROLLE],
  ['Betrachter', BETRACHTER],
  ['Sachbearbeiter', SACHBEARBEITER],
  ['Administrator', ADMIN],
]

export const SEITEN = ['/', '/coins', '/pruefung', '/benutzerverwaltung', '/verwaltung/startseite'] as const

export interface Bestand {
  url: string
  navigation: string[]
  links: string[]
  buttons: string[]
  reiter: string[]
  regionen: string[]
  endpunkte: string[]
}

function sortiert(liste: string[]): string[] {
  return [...new Set(liste.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'de'),
  )
}

/** Öffnet die Seite als Rolle, führt seitentypische Schritte aus (Prüfung, Reiter Audit-Log) und erhebt den Bestand. */
export async function erhebeBestand(
  page: Page,
  me: Me | null,
  pfad: string,
): Promise<{ bestand: Bestand; api: ApiZustand }> {
  await page.setViewportSize({ width: 1280, height: 900 })
  const api = await richteApiEin(page, me)
  let anmeldung = false
  await page.route(
    (url) => url.href.startsWith(AUTHORIZE),
    async (route) => {
      anmeldung = true
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Anmeldung</title><h1>Anmeldung</h1>',
      })
    },
  )
  await page.goto(pfad)
  await expect
    .poll(async () => anmeldung || (await page.getByRole('main').getByRole('heading', { level: 1 }).count()) > 0)
    .toBe(true)
  if (anmeldung) {
    return {
      // Endpunkte vor der Weiterleitung hängen vom Zeitpunkt ab und werden nicht verglichen.
      bestand: { url: 'Anmeldung', navigation: [], links: [], buttons: [], reiter: [], regionen: [], endpunkte: [] },
      api,
    }
  }
  // Seite vollständig geladen: keine Lade-Statusmeldung mehr.
  await expect(page.getByRole('main').getByText(/wird geladen|werden geladen/)).toHaveCount(0)
  const ort = new URL(page.url())
  if (ort.pathname === '/pruefung') {
    await page.getByLabel(/^Hologrammnummer/).fill(HOLOGRAMMNUMMER)
    await page.getByLabel(/^Hologrammnummer/).press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()
  }
  const main = page.getByRole('main')
  const namen = async (rolle: 'link' | 'button' | 'tab' | 'region', bereich = main) =>
    Promise.all(
      (await bereich.getByRole(rolle).all()).map(async (el) =>
        (await el.isVisible())
          ? el.evaluate((e) => {
              const label = e.getAttribute('aria-label')
              const bezug = e.getAttribute('aria-labelledby')
              if (label) return label
              if (bezug)
                return bezug
                  .split(/\s+/)
                  .map((id) => document.getElementById(id)?.textContent ?? '')
                  .join(' ')
              return (e as HTMLElement).innerText
            })
          : '',
      ),
    )
  const erheben = async () => ({
    navigation: await namen('link', page.getByRole('navigation', { name: 'Hauptnavigation' })),
    links: await namen('link'),
    buttons: await namen('button'),
    reiter: await namen('tab'),
    regionen: await namen('region'),
  })
  const teile = [await erheben()]
  const reiterAudit = page.getByRole('tab', { name: 'Änderungsprotokoll' })
  if (ort.pathname === '/benutzerverwaltung' && (await reiterAudit.count()) > 0) {
    await reiterAudit.click()
    await expect(page.getByRole('tabpanel', { name: 'Änderungsprotokoll' }).getByRole('table')).toBeVisible()
    teile.push(await erheben())
  }
  const vereint = (feld: keyof (typeof teile)[number]) => sortiert(teile.flatMap((t) => t[feld]))
  const bestand: Bestand = {
    url: `${ort.pathname}${ort.search}`,
    navigation: vereint('navigation'),
    links: vereint('links'),
    buttons: vereint('buttons'),
    reiter: vereint('reiter'),
    regionen: vereint('regionen'),
    endpunkte: sortiert(endpunkte(api)),
  }
  return { bestand, api }
}

/** Endpunkte ohne Ids („GET /api/coins/{id}“). */
function endpunkte(api: ApiZustand): string[] {
  return api.aufrufe.map((a) => a.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{id}'))
}
