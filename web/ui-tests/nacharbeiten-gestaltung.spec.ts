import { expect, test, type Locator, type Page } from '@playwright/test'
import { protokollPanel, mockeProtokoll } from './hilfen/aenderungsprotokoll-zustaende.js'
import { ADMIN, richteApiEin, scrolltNichtHorizontal, setzeTheme, type ApiZustand } from './hilfen/api.js'
import { erwarteSichtbarenFokus, zuKleineKlickflaechen } from './hilfen/pruefungen.js'
import {
  ansichtsKnopf,
  BETRACHTER,
  KOPF_TITEL,
  LOGOS,
  mockeKatalog,
  mockePruefung,
  oeffneStartseitenFall,
  pruefePerEnter,
  STARTSEITEN_FAELLE,
  UEBERSCHRIFT,
  type Ergebnis,
} from './hilfen/uebersicht.js'

// Feature nacharbeiten-audit-filter, AK-20 bis AK-22, AK-28 und AK-31 (UI-Test mit gemockter API): Logos im Kopfbereich
// mit Mindesthöhen 48/72/96 px ohne Verzerrung und Anordnung nach Variante A (F3), Katalogkarten mit Bildfeld 4:3 ab
// 640 px und zwei Karten je Bildschirmhöhe bei 360 × 800 px, Katalog „Tabelle“ unter 768 px als DatenTabelle-Karten,
// Ergebniskarte „nicht gefunden“ im Dunkelmodus (berechnete Farben) und Fokus nach „Erneut versuchen“ auf /coins.

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const TOLERANZ = 1

// ---------- AK-20: Logos im Kopfbereich ----------

const FALL_KOPF = STARTSEITEN_FAELLE.find((f) => f.name === 'fall1-alle')!

interface LogoMass {
  breite: number
  hoehe: number
  links: number
  oben: number
  rechts: number
  unten: number
  natuerlich: { breite: number; hoehe: number }
}

async function logoMass(page: Page, alternativtext: string): Promise<LogoMass> {
  return page.getByRole('img', { name: alternativtext }).evaluate((el) => {
    const bild = el as HTMLImageElement
    const box = bild.getBoundingClientRect()
    return {
      breite: box.width,
      hoehe: box.height,
      links: box.left,
      oben: box.top,
      rechts: box.right,
      unten: box.bottom,
      natuerlich: { breite: bild.naturalWidth, hoehe: bild.naturalHeight },
    }
  })
}

/** Kleinstes gemeinsames Element von Titel und Logos (der Kopfbereich). */
async function kopfbereich(page: Page) {
  return page.getByRole('heading', { level: 1, name: KOPF_TITEL }).evaluate(
    (titel, alts) => {
      const logos = alts.map((alt) => document.querySelector(`img[alt="${alt}"]`)!)
      let bereich: HTMLElement | null = titel.parentElement
      while (bereich && !logos.every((l) => bereich!.contains(l))) bereich = bereich.parentElement
      const box = bereich!.getBoundingClientRect()
      return { links: box.left, rechts: box.right, oben: box.top, unten: box.bottom }
    },
    [LOGOS.bereitsteller.alternativtext, LOGOS.software.alternativtext],
  )
}

const MINDESTHOEHE: ReadonlyArray<[number, number]> = [
  [360, 48],
  [768, 72],
  [1280, 96],
]

for (const [breite, mindest] of MINDESTHOEHE) {
  for (const logo of [LOGOS.bereitsteller, LOGOS.software]) {
    test(`zeigt „${logo.alternativtext}“ bei ${breite} px mindestens ${mindest} px hoch (AK-20)`, async ({ page }) => {
      api = await oeffneStartseitenFall(page, FALL_KOPF, { breite })

      const mass = await logoMass(page, logo.alternativtext)
      expect(mass.hoehe).toBeGreaterThanOrEqual(mindest - 0.5)
    })

    test(`verzerrt „${logo.alternativtext}“ bei ${breite} px nicht (AK-20)`, async ({ page }) => {
      api = await oeffneStartseitenFall(page, FALL_KOPF, { breite })

      const mass = await logoMass(page, logo.alternativtext)
      const soll = logo.breite / logo.hoehe
      expect(Math.abs(mass.breite / mass.hoehe - soll) / soll).toBeLessThanOrEqual(0.01)
      expect(mass.natuerlich.breite / mass.natuerlich.hoehe).toBeCloseTo(soll, 2)
    })

    test(`zeigt „${logo.alternativtext}“ bei ${breite} px vollständig im Kopfbereich (AK-20)`, async ({ page }) => {
      api = await oeffneStartseitenFall(page, FALL_KOPF, { breite })

      const mass = await logoMass(page, logo.alternativtext)
      const bereich = await kopfbereich(page)
      expect(mass.links).toBeGreaterThanOrEqual(bereich.links - TOLERANZ)
      expect(mass.rechts).toBeLessThanOrEqual(bereich.rechts + TOLERANZ)
      expect(mass.oben).toBeGreaterThanOrEqual(bereich.oben - TOLERANZ)
      expect(mass.unten).toBeLessThanOrEqual(bereich.unten + TOLERANZ)
    })
  }

  test(`scrollt bei ${breite} px mit Logos nicht horizontal (AK-20)`, async ({ page }) => {
    api = await oeffneStartseitenFall(page, FALL_KOPF, { breite })

    await scrolltNichtHorizontal(page)
  })
}

test('zeigt die Logos bei 1280 px höchstens 96 px hoch (AK-20)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, FALL_KOPF, { breite: 1280 })

  for (const logo of [LOGOS.bereitsteller, LOGOS.software]) {
    expect((await logoMass(page, logo.alternativtext)).hoehe).toBeLessThanOrEqual(96 + 0.5)
  }
})

async function titelBox(page: Page) {
  return (await page.getByRole('heading', { level: 1, name: KOPF_TITEL }).boundingBox())!
}

test('stellt bei 768 px beide Logos über den Titel (Variante A, AK-20)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, FALL_KOPF, { breite: 768 })

  const titel = await titelBox(page)
  for (const logo of [LOGOS.bereitsteller, LOGOS.software]) {
    expect((await logoMass(page, logo.alternativtext)).unten).toBeLessThanOrEqual(titel.y + TOLERANZ)
  }
})

test('stellt bei 768 px die Logos nebeneinander, den Bereitsteller links (AK-20)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, FALL_KOPF, { breite: 768 })

  const links = await logoMass(page, LOGOS.bereitsteller.alternativtext)
  const rechts = await logoMass(page, LOGOS.software.alternativtext)
  expect(links.rechts).toBeLessThanOrEqual(rechts.links + TOLERANZ)
  // Dieselbe Zeile: Die Logos überlappen sich senkrecht.
  expect(links.oben).toBeLessThan(rechts.unten)
  expect(links.unten).toBeGreaterThan(rechts.oben)
})

test('zeigt bei 768 px Titel und Untertitel über die volle Breite unter den Logos (AK-20)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, FALL_KOPF, { breite: 768 })

  const titel = await titelBox(page)
  const links = await logoMass(page, LOGOS.bereitsteller.alternativtext)
  const rechts = await logoMass(page, LOGOS.software.alternativtext)
  // Der Titel reicht über den Bereich beider Logos hinaus (volle Breite statt mittlerer Spalte).
  expect(titel.width).toBeGreaterThan(rechts.links - links.rechts)
})

test('stellt bei 1280 px die Logos neben den Titel (AK-20)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, FALL_KOPF, { breite: 1280 })

  const titel = await titelBox(page)
  const links = await logoMass(page, LOGOS.bereitsteller.alternativtext)
  const rechts = await logoMass(page, LOGOS.software.alternativtext)
  expect(links.rechts).toBeLessThanOrEqual(titel.x + TOLERANZ)
  expect(rechts.links).toBeGreaterThanOrEqual(titel.x + titel.width - TOLERANZ)
  for (const logo of [links, rechts]) {
    expect(logo.oben).toBeLessThan(titel.y + titel.height)
    expect(logo.unten).toBeGreaterThan(titel.y)
  }
})

test('stellt bei 360 px Bereitsteller, Titel und Software untereinander (AK-20)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, FALL_KOPF, { breite: 360 })

  const titel = await titelBox(page)
  expect((await logoMass(page, LOGOS.bereitsteller.alternativtext)).unten).toBeLessThanOrEqual(titel.y + TOLERANZ)
  expect((await logoMass(page, LOGOS.software.alternativtext)).oben).toBeGreaterThanOrEqual(
    titel.y + titel.height - TOLERANZ,
  )
})

// ---------- AK-21: Katalogkarten ----------

async function oeffneKatalog(page: Page, breite: number, hoehe = 900, ansicht: 'Tabelle' | 'Karten' = 'Karten') {
  await page.setViewportSize({ width: breite, height: hoehe })
  api = await richteApiEin(page, ADMIN)
  await mockeKatalog(page)
  await page.goto('/coins')
  await expect(
    page
      .getByRole('main')
      .getByText(/gefunden/)
      .first(),
  ).toBeVisible()
  if (ansicht === 'Karten') {
    await ansichtsKnopf(page, 'Karten').click()
    await expect(ansichtsKnopf(page, 'Karten')).toHaveAttribute('aria-pressed', 'true')
  }
}

const kartenListe = (page: Page) => page.getByRole('main').getByRole('list', { name: 'Coins' })

/** Bildfeld der ersten Karte mit Motivbild (das Bild selbst bzw. sein Rahmen mit dem Seitenverhältnis). */
async function bildfeld(karte: Locator) {
  return karte
    .getByRole('img')
    .first()
    .evaluate((bild) => {
      const box = bild.getBoundingClientRect()
      const rahmen = bild.parentElement!.getBoundingClientRect()
      // Bei object-contain trägt das Bild selbst das Seitenverhältnis; liegt es in einem eigenen Rahmen, zählt dieser.
      const feld = Math.abs(rahmen.width - box.width) < 1 && Math.abs(rahmen.height - box.height) < 1 ? box : rahmen
      return { breite: feld.width, hoehe: feld.height, objectFit: getComputedStyle(bild).objectFit }
    })
}

for (const breite of [768, 1280]) {
  test(`gibt dem Bildfeld der Karten bei ${breite} px das Seitenverhältnis 4:3 (AK-21)`, async ({ page }) => {
    await oeffneKatalog(page, breite)

    const feld = await bildfeld(kartenListe(page).getByRole('listitem').first())
    expect(Math.abs(feld.breite * 0.75 - feld.hoehe)).toBeLessThanOrEqual(TOLERANZ)
  })

  test(`zeigt das Motivbild der Karten bei ${breite} px unbeschnitten (object-contain, AK-21)`, async ({ page }) => {
    await oeffneKatalog(page, breite)

    const feld = await bildfeld(kartenListe(page).getByRole('listitem').first())
    expect(feld.objectFit).toBe('contain')
  })
}

test('zeigt bei 360 × 800 px zwei Karten vollständig unter der Kopfzeile (AK-21)', async ({ page }) => {
  await oeffneKatalog(page, 360, 800)

  const karten = kartenListe(page).getByRole('listitem')
  await karten.first().scrollIntoViewIfNeeded()
  const kopfzeile = (await page.getByRole('banner').boundingBox())!
  const erste = (await karten.nth(0).boundingBox())!
  const zweite = (await karten.nth(1).boundingBox())!
  const benoetigt = zweite.y + zweite.height - erste.y
  expect(benoetigt).toBeLessThanOrEqual(800 - (kopfzeile.y + kopfzeile.height))
})

test('behält bei 360 px je Karte genau einen Tab-Stopp (AK-21)', async ({ page }) => {
  await oeffneKatalog(page, 360, 800)

  const karte = kartenListe(page).getByRole('listitem').first()
  await expect(karte.getByRole('link')).toHaveCount(1)
})

// ---------- AK-31: Ansicht „Tabelle“ unter 768 px ----------

test.describe('Katalog „Tabelle“ bei 360 px (AK-31)', () => {
  test('zeigt die Liste „Coins“ und keine Tabelle', async ({ page }) => {
    await oeffneKatalog(page, 360, 800, 'Tabelle')

    await expect(kartenListe(page)).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('zeigt je Karte eine h3 mit Link', async ({ page }) => {
    await oeffneKatalog(page, 360, 800, 'Tabelle')

    const karte = kartenListe(page).getByRole('listitem').first()
    await expect(karte.getByRole('heading', { level: 3 }).getByRole('link')).toHaveCount(1)
  })

  test('zeigt in der Karte Bild, Herausgeber, Auflage und Erfasst am als Begriffe', async ({ page }) => {
    await oeffneKatalog(page, 360, 800, 'Tabelle')

    const karte = kartenListe(page).getByRole('listitem').first()
    await expect(karte.getByRole('term')).toHaveText(['Bild', 'Herausgeber', 'Auflage', 'Erfasst am'])
  })

  test('scrollt nicht horizontal', async ({ page }) => {
    await oeffneKatalog(page, 360, 800, 'Tabelle')

    await scrolltNichtHorizontal(page)
  })

  test('hat Klickflächen von mindestens 40 px', async ({ page }) => {
    await oeffneKatalog(page, 360, 800, 'Tabelle')

    expect(await zuKleineKlickflaechen(kartenListe(page))).toEqual([])
  })

  test('zeigt ab 768 px die Tabelle „Coins“ mit aria-sort an „Name“', async ({ page }) => {
    await oeffneKatalog(page, 1280, 900, 'Tabelle')

    await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending')
  })
})

// ---------- AK-22: Prüfergebnis „nicht gefunden“ im Dunkelmodus ----------

interface Ergebnisfarben {
  karte: string
  kopf: string
  kreis: string
  titelZuKopf: number
  iconZuKreis: number
  rahmenZuKarte: number
  titel: string
  icon: string
  rahmen: string
}

async function oeffnePruefung(page: Page, theme: 'light' | 'dark', ergebnis: Ergebnis) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await setzeTheme(page, theme)
  api = await richteApiEin(page, BETRACHTER)
  await mockePruefung(page)
  await page.goto('/pruefung')
  await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()
  await pruefePerEnter(page, ergebnis)
}

/** Berechnete Farben der Ergebniskarte: Karte, Kopffläche, Icon-Kreis, Titel, Icon und Rahmen samt Kontrasten. */
async function ergebnisfarben(page: Page, ergebnis: Ergebnis): Promise<Ergebnisfarben> {
  return page.getByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] }).evaluate((titel) => {
    const leinwand = document.createElement('canvas').getContext('2d')!
    const rgb = (farbe: string): [number, number, number] => {
      leinwand.clearRect(0, 0, 1, 1)
      leinwand.fillStyle = farbe
      leinwand.fillRect(0, 0, 1, 1)
      const [r, g, b] = leinwand.getImageData(0, 0, 1, 1).data
      return [r, g, b]
    }
    const leuchtdichte = ([r, g, b]: number[]) => {
      const kanal = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
    }
    const verhaeltnis = (a: string, b: string) => {
      const [hell, dunkel] = [leuchtdichte(rgb(a)), leuchtdichte(rgb(b))].sort((x, y) => y - x)
      return (hell + 0.05) / (dunkel + 0.05)
    }
    const deckend = (start: Element | null) => {
      for (let e = start; e; e = e.parentElement) {
        const farbe = getComputedStyle(e).backgroundColor
        leinwand.clearRect(0, 0, 1, 1)
        leinwand.fillStyle = farbe
        leinwand.fillRect(0, 0, 1, 1)
        if (leinwand.getImageData(0, 0, 1, 1).data[3] > 250) return farbe
      }
      return 'rgb(255, 255, 255)'
    }
    const karteEl = titel.closest('[data-slot="card"]') ?? titel.parentElement!.parentElement!.parentElement!
    const svg = karteEl.querySelector('svg')!
    const kreisEl = svg.parentElement!
    const kopfEl = kreisEl.parentElement!
    const karte = deckend(karteEl)
    const kopf = deckend(kopfEl)
    const kreis = deckend(kreisEl)
    const titelFarbe = getComputedStyle(titel).color
    const iconFarbe = getComputedStyle(svg).color
    const rahmen = getComputedStyle(karteEl).borderTopColor
    return {
      karte,
      kopf,
      kreis,
      titel: titelFarbe,
      icon: iconFarbe,
      rahmen,
      titelZuKopf: verhaeltnis(titelFarbe, kopf),
      iconZuKreis: verhaeltnis(iconFarbe, kreis),
      rahmenZuKarte: verhaeltnis(rahmen, karte),
    }
  })
}

/** Berechnete Farbe eines Tokens (z. B. `--muted`) als rgb(...). */
async function tokenFarbe(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${name})`
    document.body.append(probe)
    const farbe = getComputedStyle(probe).backgroundColor
    probe.remove()
    return farbe
  }, token)
}

test.describe('Ergebniskarte „nicht gefunden“ im Dunkelmodus (AK-22)', () => {
  test('hebt die Kopffläche von der Karte ab', async ({ page }) => {
    await oeffnePruefung(page, 'dark', 'nichtGefunden')

    const farben = await ergebnisfarben(page, 'nichtGefunden')
    expect(farben.kopf).not.toBe(farben.karte)
  })

  test('hat zwischen Titel und Kopffläche mindestens 4,5 : 1', async ({ page }) => {
    await oeffnePruefung(page, 'dark', 'nichtGefunden')

    expect((await ergebnisfarben(page, 'nichtGefunden')).titelZuKopf).toBeGreaterThanOrEqual(4.5)
  })

  test('hat zwischen Icon und Kreis mindestens 3 : 1', async ({ page }) => {
    await oeffnePruefung(page, 'dark', 'nichtGefunden')

    expect((await ergebnisfarben(page, 'nichtGefunden')).iconZuKreis).toBeGreaterThanOrEqual(3)
  })

  test('hebt den Icon-Kreis von der Kopffläche ab', async ({ page }) => {
    await oeffnePruefung(page, 'dark', 'nichtGefunden')

    const farben = await ergebnisfarben(page, 'nichtGefunden')
    expect(farben.kreis).not.toBe(farben.kopf)
  })

  test('hat zwischen Rahmen und Karte mindestens 3 : 1', async ({ page }) => {
    await oeffnePruefung(page, 'dark', 'nichtGefunden')

    expect((await ergebnisfarben(page, 'nichtGefunden')).rahmenZuKarte).toBeGreaterThanOrEqual(3)
  })

  test('unterscheidet sich ohne Farbe über Titel und Icon von den anderen Ergebnissen', async ({ page }) => {
    await oeffnePruefung(page, 'dark', 'nichtGefunden')

    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.nichtGefunden })).toBeVisible()
    await expect(page.locator('svg.lucide-search-x')).toHaveCount(1)
  })
})

test.describe('Ergebniskarte „nicht gefunden“ im hellen Modus unverändert (AK-22)', () => {
  test('nutzt für die Kopffläche weiter --muted', async ({ page }) => {
    await oeffnePruefung(page, 'light', 'nichtGefunden')

    expect((await ergebnisfarben(page, 'nichtGefunden')).kopf).toBe(await tokenFarbe(page, '--muted'))
  })

  test('nutzt für Titel und Rahmen weiter --muted-foreground', async ({ page }) => {
    await oeffnePruefung(page, 'light', 'nichtGefunden')

    const farben = await ergebnisfarben(page, 'nichtGefunden')
    const soll = await tokenFarbe(page, '--muted-foreground')
    expect([farben.titel, farben.rahmen]).toEqual([soll, soll])
  })

  test('nutzt für den Icon-Kreis weiter --card', async ({ page }) => {
    await oeffnePruefung(page, 'light', 'nichtGefunden')

    expect((await ergebnisfarben(page, 'nichtGefunden')).kreis).toBe(await tokenFarbe(page, '--card'))
  })
})

// ---------- AK-28: Fokus nach „Erneut versuchen“ auf /coins und im Änderungsprotokoll ----------

test.describe('Fokus nach „Erneut versuchen“ (AK-28)', () => {
  test('setzt auf /coins per Enter den Fokus in den Inhaltsbereich mit sichtbarem Fokusring', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    api = await richteApiEin(page, ADMIN)
    const katalog = await mockeKatalog(page, { fehler: 99 })
    await page.goto('/coins')
    const knopf = page.getByRole('main').getByRole('button', { name: 'Erneut versuchen' })
    await expect(knopf).toBeVisible()
    katalog.fehlerBeheben()

    await knopf.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
    expect(await page.evaluate(() => document.activeElement?.closest('main#inhalt') !== null)).toBe(true)
    await erwarteSichtbarenFokus(page)
  })

  test('lässt auf /coins bei erneutem Fehler den Fokus im Inhaltsbereich und zeigt den Alarm', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    api = await richteApiEin(page, ADMIN)
    await mockeKatalog(page, { fehler: 99 })
    await page.goto('/coins')
    const knopf = page.getByRole('main').getByRole('button', { name: 'Erneut versuchen' })
    await expect(knopf).toBeVisible()

    await knopf.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  })

  test('setzt im Änderungsprotokoll per Enter den Fokus in den Inhaltsbereich mit sichtbarem Fokusring', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    api = await richteApiEin(page, ADMIN)
    const protokoll = await mockeProtokoll(page)
    protokoll.fehler(99)
    await page.goto('/benutzerverwaltung?reiter=aenderungsprotokoll')
    const knopf = protokollPanel(page).getByRole('button', { name: 'Erneut versuchen' })
    await expect(knopf).toBeVisible()
    protokoll.fehler(0)

    await knopf.focus()
    await page.keyboard.press('Enter')

    await expect(protokollPanel(page).getByRole('table', { name: 'Änderungsprotokoll' })).toBeVisible()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
    await erwarteSichtbarenFokus(page)
  })
})
