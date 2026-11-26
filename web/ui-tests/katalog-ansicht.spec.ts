import { expect, test, type Page } from '@playwright/test'
import { ADMIN, richteApiEin, scrolltNichtHorizontal, type ApiZustand } from './hilfen/api.js'
import { zuKleineKlickflaechen } from './hilfen/pruefungen.js'
import { ansichtsKnopf, BETRACHTER, katalogCoin, mockeKatalog, type KatalogZustand } from './hilfen/uebersicht.js'

// Feature startseite-listen-pruefung, AK-10 bis AK-18 (Abschnitt 4.2, ADR-0043 Punkt 2, ADR-0044; UI-Test mit gemockter
// API): Filterleiste mit großem Suchfeld und Ansichtsumschalter in derselben Karte, Umschalten per Tastatur, Speicherung
// über Neuladen und Navigation, kein Request beim Wechsel, Kartenansicht (Klick, Tab-Stopps, Spalten), Blättern in
// beiden Ansichten, Chip „Suche“, Leer- und Fehlerzustände. 360 und 1280 px.

const SCHLUESSEL = 'coin-katalog-ansicht'

let api: ApiZustand
let katalog: KatalogZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

async function oeffne(
  page: Page,
  {
    breite = 1280,
    pfad = '/coins',
    coins,
    fehler,
    als = ADMIN,
  }: { breite?: number; pfad?: string; coins?: unknown[]; fehler?: number; als?: typeof ADMIN } = {},
) {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteApiEin(page, als)
  katalog = await mockeKatalog(page, { coins, fehler })
  await page.goto(pfad)
  await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()
}

async function geladen(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /gefunden/ })).toBeVisible()
}

const suchfeld = (page: Page) => page.getByRole('searchbox', { name: 'Coins suchen' })
const kartenListe = (page: Page) => page.getByRole('main').getByRole('list', { name: 'Coins' })
const tabelle = (page: Page) => page.getByRole('table', { name: 'Coins' })

// ---------- AK-10: Filterleiste ----------

test.describe('Filterleiste (AK-10)', () => {
  test('hat ein Suchfeld von mindestens 48 px Höhe und bei 1280 px mindestens 320 px Breite', async ({ page }) => {
    await oeffne(page)

    const box = (await suchfeld(page).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(48)
    expect(box.width).toBeGreaterThanOrEqual(320)
  })

  test('zeigt im Suchformular eine Lupe als Präfix, für Screenreader ausgeblendet', async ({ page }) => {
    await oeffne(page)

    const praefix = await page.getByRole('search').evaluate((form) => {
      const feld = form.querySelector('input[type="search"]') as HTMLElement
      return [...form.querySelectorAll('svg')]
        .filter((svg) => !svg.closest('button'))
        .map((svg) => ({
          versteckt: svg.getAttribute('aria-hidden') === 'true',
          links: svg.getBoundingClientRect().right <= feld.getBoundingClientRect().left + 48,
        }))
    })
    expect(praefix.length).toBeGreaterThanOrEqual(1)
    expect(praefix.every((p) => p.versteckt)).toBe(true)
    expect(praefix.some((p) => p.links)).toBe(true)
  })

  test('hat den Button „Suchen“', async ({ page }) => {
    await oeffne(page)

    await expect(page.getByRole('search').getByRole('button', { name: 'Suchen', exact: true })).toBeVisible()
  })

  test('stellt Suchformular und Ansichtsumschalter in dieselbe Karte', async ({ page }) => {
    await oeffne(page)

    const gleicheKarte = await page.evaluate(() => {
      const form = document.querySelector('[role="search"]')
      const gruppe = document.querySelector('[role="group"][aria-label="Ansicht"]')
      const karte = (el: Element | null) => el?.closest('[data-slot="card"]') ?? null
      return karte(form) !== null && karte(form) === karte(gruppe)
    })
    expect(gleicheKarte).toBe(true)
  })

  test('bricht bei 360 px um, ohne horizontales Scrollen, mit allen Elementen im Viewport', async ({ page }) => {
    await oeffne(page, { breite: 360 })
    await geladen(page)

    await scrolltNichtHorizontal(page)
    for (const element of [suchfeld(page), ansichtsKnopf(page, 'Tabelle'), ansichtsKnopf(page, 'Karten')]) {
      const box = (await element.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(360)
    }
  })
})

// ---------- AK-12: Ansichtsumschalter ----------

test.describe('Ansichtsumschalter (AK-12)', () => {
  // nacharbeiten-audit-filter E6 (ADR-0046): bei 360 px zeigt „Tabelle“ die Karten der DatenTabelle (Liste „Coins“).
  test('aktiviert ohne gespeicherte Wahl „Tabelle“ und zeigt die Tabelle (360 und 1280 px)', async ({ page }) => {
    for (const breite of [360, 1280]) {
      await oeffne(page, { breite })
      await expect(ansichtsKnopf(page, 'Tabelle')).toHaveAttribute('aria-pressed', 'true')
      await expect(ansichtsKnopf(page, 'Karten')).toHaveAttribute('aria-pressed', 'false')
      if (breite === 360) {
        await expect(kartenListe(page)).toBeVisible()
        await expect(page.getByRole('table')).toHaveCount(0)
      } else {
        await expect(tabelle(page)).toBeVisible()
      }
    }
  })

  test('ist per Tab erreichbar und wechselt per Enter zu „Karten“', async ({ page }) => {
    await oeffne(page)
    await geladen(page)
    await suchfeld(page).focus()

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      if (await ansichtsKnopf(page, 'Karten').evaluate((el) => el === document.activeElement)) break
      const inGruppe = await page
        .getByRole('group', { name: 'Ansicht' })
        .evaluate((g) => g.contains(document.activeElement))
      // toggle-group: rovierender Fokus innerhalb der Gruppe per Pfeiltaste.
      if (inGruppe) await page.keyboard.press('ArrowRight')
      if (await ansichtsKnopf(page, 'Karten').evaluate((el) => el === document.activeElement)) break
    }
    await expect(ansichtsKnopf(page, 'Karten')).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(ansichtsKnopf(page, 'Karten')).toHaveAttribute('aria-pressed', 'true')
    await expect(kartenListe(page)).toBeVisible()
  })

  test('wechselt per Leertaste zurück zu „Tabelle“', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()
    await expect(kartenListe(page)).toBeVisible()

    await ansichtsKnopf(page, 'Tabelle').focus()
    await page.keyboard.press(' ')

    await expect(ansichtsKnopf(page, 'Tabelle')).toHaveAttribute('aria-pressed', 'true')
    await expect(tabelle(page)).toBeVisible()
  })

  for (const breite of [360, 1280]) {
    test(`gibt beiden Elementen bei ${breite} px eine Klickfläche von mindestens 40 × 40 px`, async ({ page }) => {
      await oeffne(page, { breite })

      expect(await zuKleineKlickflaechen(page.getByRole('group', { name: 'Ansicht' }))).toEqual([])
      await expect(page.getByRole('group', { name: 'Ansicht' }).getByRole('button')).toHaveCount(2)
    })
  }

  test('nennt die Elemente mit ihrem sichtbaren Text', async ({ page }) => {
    await oeffne(page)

    await expect(ansichtsKnopf(page, 'Tabelle')).toHaveText('Tabelle')
    await expect(ansichtsKnopf(page, 'Karten')).toHaveText('Karten')
  })
})

// ---------- AK-13: Speicherung ----------

test.describe('Speicherung der Ansicht (AK-13)', () => {
  test('löst beim Wechsel keinen Request aus und ändert die URL nicht', async ({ page }) => {
    await oeffne(page, { pfad: '/coins?suche=Katalogcoin' })
    await geladen(page)
    const abrufe = katalog.abrufe.length
    const url = page.url()

    await ansichtsKnopf(page, 'Karten').click()
    await expect(kartenListe(page)).toBeVisible()

    expect(katalog.abrufe.length).toBe(abrufe)
    expect(page.url()).toBe(url)
  })

  test('schreibt die Wahl unter coin-katalog-ansicht in den localStorage', async ({ page }) => {
    await oeffne(page)

    await ansichtsKnopf(page, 'Karten').click()

    await expect.poll(() => page.evaluate((s) => localStorage.getItem(s), SCHLUESSEL)).toBe('karten')
  })

  test('zeigt die gewählte Ansicht nach dem Neuladen wieder', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()
    await expect(kartenListe(page)).toBeVisible()

    await page.reload()

    await expect(kartenListe(page)).toBeVisible()
    await expect(ansichtsKnopf(page, 'Karten')).toHaveAttribute('aria-pressed', 'true')
  })

  test('zeigt die gewählte Ansicht nach Navigation weg und zurück wieder', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()
    const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' })

    await navigation.getByRole('link', { name: 'Startseite', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Katalog')
    await navigation.getByRole('link', { name: 'Katalog', exact: true }).click()

    await expect(kartenListe(page)).toBeVisible()
  })

  test('zeigt bei einem ungültigen gespeicherten Wert die Tabelle ohne Fehler', async ({ page }) => {
    const fehler: string[] = []
    page.on('pageerror', (e) => fehler.push(e.message))
    await page.addInitScript((s) => localStorage.setItem(s, 'kacheln'), SCHLUESSEL)
    await oeffne(page)

    await expect(tabelle(page)).toBeVisible()
    await expect(ansichtsKnopf(page, 'Tabelle')).toHaveAttribute('aria-pressed', 'true')
    expect(fehler).toEqual([])
  })

  test('schaltet bei gesperrtem localStorage um, ohne Fehler', async ({ page }) => {
    const fehler: string[] = []
    page.on('pageerror', (e) => fehler.push(e.message))
    await page.addInitScript((s) => {
      const lesen = Storage.prototype.getItem
      const schreiben = Storage.prototype.setItem
      Storage.prototype.getItem = function (schluessel: string) {
        if (schluessel === s) throw new DOMException('gesperrt', 'SecurityError')
        return lesen.call(this, schluessel)
      }
      Storage.prototype.setItem = function (schluessel: string, wert: string) {
        if (schluessel === s) throw new DOMException('gesperrt', 'SecurityError')
        return schreiben.call(this, schluessel, wert)
      }
    }, SCHLUESSEL)
    await oeffne(page)

    await ansichtsKnopf(page, 'Karten').click()

    await expect(kartenListe(page)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(fehler).toEqual([])
  })
})

// ---------- AK-14/AK-15: Tabelle und Karten ----------

test.describe('Tabellen- und Kartenansicht (AK-14, AK-15)', () => {
  test('zeigt in der Tabelle „unbekannt“ als Badge mit genau diesem Text', async ({ page }) => {
    await oeffne(page)

    const zeile = tabelle(page).getByRole('row').filter({ hasText: 'Katalogcoin 003' })
    await expect(zeile.getByText('unbekannt', { exact: true })).toBeVisible()
  })

  test('zeigt eine Karte je Coin der Seite in der Reihenfolge der API', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()

    const titel = kartenListe(page).getByRole('listitem').getByRole('heading', { level: 3 })
    await expect(titel).toHaveCount(25)
    await expect(titel.first()).toHaveText('Katalogcoin 001')
    await expect(titel.nth(1)).toHaveText('Katalogcoin 002')
  })

  test('zeigt den Chip „Auflage unbekannt“ nur bei Coins ohne Auflage', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()

    const karten = kartenListe(page).getByRole('listitem')
    await expect(karten.filter({ hasText: 'Katalogcoin 003' }).getByText('Auflage unbekannt')).toBeVisible()
    await expect(karten.filter({ hasText: 'Katalogcoin 002' }).getByText('Auflage unbekannt')).toHaveCount(0)
  })

  test('öffnet per Mausklick in die Karte außerhalb des Links die Detailseite', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()

    const karte = kartenListe(page).getByRole('listitem').filter({ hasText: 'Katalogcoin 002' })
    const box = (await karte.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8)

    await expect(page).toHaveURL(new RegExp(`/coins/${katalogCoin(2).id}$`))
  })

  test('hat je Karte genau einen Tab-Stopp, den Link', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()

    const stopps = await kartenListe(page).evaluate((liste) =>
      [...liste.querySelectorAll(':scope > li')].map(
        (li) =>
          [...li.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].filter(
            (el) => el.tabIndex >= 0,
          ).length,
      ),
    )
    expect(stopps.length).toBe(25)
    expect(stopps.every((n) => n === 1)).toBe(true)
  })

  for (const [breite, mindestens, hoechstens] of [
    [360, 1, 1],
    [1280, 3, 4],
  ] as const) {
    test(`zeigt bei ${breite} px ${mindestens === hoechstens ? mindestens : `${mindestens}–${hoechstens}`} Kartenspalte(n)`, async ({
      page,
    }) => {
      await oeffne(page, { breite })
      await ansichtsKnopf(page, 'Karten').click()
      await expect(kartenListe(page)).toBeVisible()

      const spalten = await kartenListe(page).evaluate((liste) => {
        const karten = [...liste.querySelectorAll(':scope > li')].map((li) => li.getBoundingClientRect())
        return karten.filter((r) => Math.abs(r.top - karten[0].top) <= 1).length
      })
      expect(spalten).toBeGreaterThanOrEqual(mindestens)
      expect(spalten).toBeLessThanOrEqual(hoechstens)
    })
  }

  test('gibt den Kartenlinks bei 360 px eine Klickfläche von mindestens 40 × 40 px', async ({ page }) => {
    await oeffne(page, { breite: 360 })
    await ansichtsKnopf(page, 'Karten').click()

    expect(await zuKleineKlickflaechen(kartenListe(page))).toEqual([])
  })

  test('scrollt in der Kartenansicht bei 360 px nicht horizontal', async ({ page }) => {
    await oeffne(page, { breite: 360 })
    await ansichtsKnopf(page, 'Karten').click()
    await expect(kartenListe(page)).toBeVisible()

    await scrolltNichtHorizontal(page)
  })
})

// ---------- AK-16: Blättern ----------

test.describe('Blättern (AK-16)', () => {
  test('behält beim Blättern die Kartenansicht', async ({ page }) => {
    await oeffne(page)
    await ansichtsKnopf(page, 'Karten').click()

    await page.getByRole('button', { name: 'Nächste Seite' }).click()

    await expect(page.getByText('Seite 2 von 2')).toBeVisible()
    await expect(kartenListe(page).getByRole('listitem')).toHaveCount(5)
    await expect(ansichtsKnopf(page, 'Karten')).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/seite=2/)
  })

  test('blättert in der Tabellenansicht wie bisher', async ({ page }) => {
    await oeffne(page)

    await page.getByRole('button', { name: 'Nächste Seite' }).click()

    await expect(page.getByText('Seite 2 von 2')).toBeVisible()
    await expect(tabelle(page).getByRole('link')).toHaveCount(5)
  })
})

// ---------- AK-11: Chip „Suche“ ----------

test.describe('Chip „Suche“ (AK-11)', () => {
  test('zeigt nach dem Suchen genau einen Chip „Suche: {Begriff}“ und schreibt suche in die URL', async ({ page }) => {
    await oeffne(page, { pfad: '/coins?seite=2' })
    await geladen(page)

    await suchfeld(page).fill('Herausgeber 2')
    await suchfeld(page).press('Enter')

    await expect(page).toHaveURL(/suche=Herausgeber(\+|%20)2/)
    await expect(page).not.toHaveURL(/seite=/)
    const chips = page.getByRole('list', { name: 'Aktive Filter' }).getByRole('listitem')
    await expect(chips).toHaveCount(1)
    await expect(chips).toHaveText('Suche: Herausgeber 2')
  })

  test('entfernt per Chip die Suche aus der URL, lädt einmal neu und fokussiert das Suchfeld', async ({ page }) => {
    await oeffne(page, { pfad: '/coins?suche=Katalogcoin' })
    await geladen(page)
    const abrufe = katalog.abrufe.length

    await page.getByRole('button', { name: 'Filter „Suche: Katalogcoin“ entfernen' }).click()

    await expect(page).not.toHaveURL(/suche=/)
    await expect(suchfeld(page)).toBeFocused()
    await expect(page.getByRole('list', { name: 'Aktive Filter' })).toHaveCount(0)
    await expect
      .poll(() => katalog.abrufe.slice(abrufe).filter((u) => !u.searchParams.has('suche')).length)
      .toBeGreaterThan(0)
  })

  test('zeigt ohne Suchbegriff keine Chip-Liste', async ({ page }) => {
    await oeffne(page)
    await geladen(page)

    await expect(page.getByRole('list', { name: 'Aktive Filter' })).toHaveCount(0)
  })
})

// ---------- AK-17: Leerzustände ----------

test.describe('Leerzustände (AK-17)', () => {
  test('zeigt ohne Coins h2 „Noch keine Coins erfasst.“ und höchstens einen Link „Coin hinzufügen“', async ({
    page,
  }) => {
    await oeffne(page, { coins: [] })

    await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Coins erfasst.' })).toBeVisible()
    expect(await page.getByRole('link', { name: 'Coin hinzufügen' }).count()).toBeLessThanOrEqual(1)
  })

  test('zeigt ohne Treffer h2 „Keine Coins gefunden.“ mit Beschreibung und „Suche zurücksetzen“', async ({ page }) => {
    await oeffne(page, { pfad: '/coins?suche=gibtesnicht' })

    await expect(page.getByRole('heading', { level: 2, name: 'Keine Coins gefunden.' })).toBeVisible()
    await expect(
      page.getByText('Prüfen Sie die Schreibweise oder suchen Sie nach einem anderen Begriff.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Suche zurücksetzen' }).click()

    await expect(page).not.toHaveURL(/suche=/)
    await expect(tabelle(page)).toBeVisible()
  })

  test('zeigt hinter dem Ende h2 „Auf dieser Seite gibt es keine Coins.“ mit Blättern', async ({ page }) => {
    await oeffne(page, { pfad: '/coins?seite=7' })

    await expect(page.getByRole('heading', { level: 2, name: 'Auf dieser Seite gibt es keine Coins.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Vorherige Seite' })).toBeVisible()
  })

  test('zeigt dem Betrachter ohne Coins keinen Link „Coin hinzufügen“', async ({ page }) => {
    await oeffne(page, { coins: [], als: BETRACHTER })

    await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Coins erfasst.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)
  })
})

// ---------- AK-18: Ladefehler ----------

test.describe('Ladefehler (AK-18)', () => {
  test('zeigt den Fehler als Alarm mit „Erneut versuchen“ und lädt mit gleicher Suche und Seite neu', async ({
    page,
  }) => {
    await oeffne(page, { pfad: '/coins?suche=Katalogcoin&seite=2', fehler: 99 })
    const alarm = page
      .getByRole('alert')
      .filter({ hasText: 'Coins konnten nicht geladen werden. Bitte später erneut versuchen.' })
    await expect(alarm).toBeVisible()
    const abrufe = katalog.abrufe.length
    katalog.fehlerBeheben()

    await alarm.getByRole('button', { name: 'Erneut versuchen' }).click()

    await expect(tabelle(page)).toBeVisible()
    const neu = katalog.abrufe.slice(abrufe)
    expect(neu.length).toBeGreaterThanOrEqual(1)
    expect(neu.every((u) => u.searchParams.get('suche') === 'Katalogcoin' && u.searchParams.get('seite') === '2')).toBe(
      true,
    )
  })

  test('scrollt im Fehlerzustand bei 360 px nicht horizontal', async ({ page }) => {
    await oeffne(page, { breite: 360, fehler: 5 })
    await expect(page.getByRole('alert').filter({ hasText: 'Coins konnten nicht geladen werden.' })).toBeVisible()

    await scrolltNichtHorizontal(page)
  })
})
