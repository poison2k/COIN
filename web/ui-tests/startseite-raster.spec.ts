import { expect, test, type Page } from '@playwright/test'
import { richteApiEin, scrolltNichtHorizontal, type ApiZustand } from './hilfen/api.js'
import { zuKleineKlickflaechen } from './hilfen/pruefungen.js'
import {
  BETRACHTER,
  KOPF_TITEL,
  LOGOS,
  messeRaster,
  mockeStartseite,
  oeffneStartseitenFall,
  STARTSEITEN_FAELLE,
  type StartseitenFall,
} from './hilfen/uebersicht.js'

// Feature startseite-listen-pruefung, AK-2 und AK-4 bis AK-8 (Abschnitt 4.1, 11.2; UI-Test mit gemockter API): Raster
// ohne Lücken für die sechs Fälle bei 1280 und 360 px (Ränder je Zeile, gleiche Höhe, gleicher Zeilenabstand 24 px),
// Zeilenbildung nach 4.1, Kopfbereich (Logos neben bzw. über/unter dem Titel, Titel ≥ 30 px), Kennzahlen als vier Karten
// (4/2/1 Spalten), Neueste als Kacheln, Meistausgegebene als Rangliste ohne doppelte Nummerierung, „Erneut versuchen“.

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const fall = (name: string): StartseitenFall => STARTSEITEN_FAELLE.find((f) => f.name.startsWith(name))!

const TOLERANZ = 1

// ---------- AK-2: keine Lücken ----------

for (const f of STARTSEITEN_FAELLE) {
  for (const breite of [1280, 360]) {
    test.describe(`Raster ${f.name} (${f.beschreibung}) bei ${breite} px (AK-2)`, () => {
      test('füllt jede Zeile vom linken bis zum rechten Rand des Rasters', async ({ page }) => {
        api = await oeffneStartseitenFall(page, f, { breite })

        const { raster, zeilen } = await messeRaster(page)
        const abweichungen = zeilen.flatMap((zeile) => {
          const erste = zeile[0]
          const letzte = zeile[zeile.length - 1]
          const namen = zeile.map((z) => z.name).join(' + ')
          return [
            ...(Math.abs(erste.links - raster.links) > TOLERANZ
              ? [`${namen}: links ${erste.links} ≠ ${raster.links}`]
              : []),
            ...(Math.abs(letzte.rechts - raster.rechts) > TOLERANZ
              ? [`${namen}: rechts ${letzte.rechts} ≠ ${raster.rechts}`]
              : []),
          ]
        })
        expect(abweichungen).toEqual([])
      })

      test('macht die Blöcke einer Zeile gleich hoch', async ({ page }) => {
        api = await oeffneStartseitenFall(page, f, { breite })

        const { zeilen } = await messeRaster(page)
        const ungleich = zeilen
          .filter((zeile) => Math.max(...zeile.map((z) => z.hoehe)) - Math.min(...zeile.map((z) => z.hoehe)) > TOLERANZ)
          .map((zeile) => zeile.map((z) => `${z.name} ${Math.round(z.hoehe)} px`).join(' / '))
        expect(ungleich).toEqual([])
      })

      test('hält zwischen allen Zeilen denselben Abstand von 24 px', async ({ page }) => {
        api = await oeffneStartseitenFall(page, f, { breite })

        const { zeilen } = await messeRaster(page)
        const abstaende = zeilen.slice(1).map((zeile, i) => {
          const vorher = zeilen[i]
          return Math.round((Math.min(...zeile.map((z) => z.oben)) - Math.max(...vorher.map((z) => z.unten))) * 10) / 10
        })
        expect(
          abstaende.filter((a) => Math.abs(a - 24) > TOLERANZ),
          `Abstände ${abstaende.join(', ')}`,
        ).toEqual([])
      })

      test('scrollt nicht horizontal', async ({ page }) => {
        api = await oeffneStartseitenFall(page, f, { breite })

        await scrolltNichtHorizontal(page)
      })
    })
  }
}

// ---------- Zeilenbildung nach 4.1 (AK-1 im Browser) ----------

const NAMEN = {
  kopf: `h1 ${KOPF_TITEL}`,
  begruessung: 'h1 Willkommen bei C.O.I.N.',
  infotext: 'Information',
  kennzahlen: 'Kennzahlen',
  neueste: 'Neueste Coins',
  meistausgegeben: 'Meistausgegebene Coins',
}

const ZEILEN_1280: Record<string, string[][]> = {
  'fall1-alle': [[NAMEN.kopf], [NAMEN.infotext], [NAMEN.kennzahlen], [NAMEN.neueste, NAMEN.meistausgegeben]],
  'fall2-ohne-kennzahlen-infotext': [[NAMEN.kopf], [NAMEN.neueste, NAMEN.meistausgegeben]],
  'fall3-getrennte-paare': [[NAMEN.kopf], [NAMEN.neueste], [NAMEN.kennzahlen], [NAMEN.meistausgegeben]],
  'fall4-kennzahlen-meistausgegeben': [[NAMEN.begruessung], [NAMEN.kennzahlen], [NAMEN.meistausgegeben]],
  'fall5-nur-neueste-leer': [[NAMEN.begruessung], [NAMEN.neueste]],
  'fall6-anonym-kopf': [[NAMEN.kopf]],
}

for (const f of STARTSEITEN_FAELLE) {
  test(`bildet bei 1280 px für ${f.name} die Zeilen nach 4.1`, async ({ page }) => {
    api = await oeffneStartseitenFall(page, f, { breite: 1280 })

    const { zeilen } = await messeRaster(page)
    expect(zeilen.map((zeile) => zeile.map((z) => z.name))).toEqual(ZEILEN_1280[f.name])
  })

  test(`stellt bei 360 px für ${f.name} jeden Block in eine eigene Zeile`, async ({ page }) => {
    api = await oeffneStartseitenFall(page, f, { breite: 360 })

    const { zeilen } = await messeRaster(page)
    expect(zeilen.map((zeile) => zeile.length).every((n) => n === 1)).toBe(true)
  })
}

test('stellt Neueste und Meistausgegebene bei 768 px untereinander (unter 1024 px eine Spalte)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall2'), { breite: 768 })

  const { zeilen } = await messeRaster(page)
  expect(zeilen.map((zeile) => zeile.map((z) => z.name))).toEqual([
    [NAMEN.kopf],
    [NAMEN.neueste],
    [NAMEN.meistausgegeben],
  ])
})

// ---------- AK-3: leere Blöcke ----------

test('zeigt den leeren Block „Neueste Coins“ als Karte mit Leertext h3 über die volle Breite (Fall 5)', async ({
  page,
}) => {
  api = await oeffneStartseitenFall(page, fall('fall5'), { breite: 1280 })

  const region = page.getByRole('region', { name: 'Neueste Coins' })
  await expect(region.getByRole('heading', { level: 3, name: 'Noch keine Coins im Katalog.' })).toBeVisible()
  const { raster } = await messeRaster(page)
  const box = (await region.boundingBox())!
  expect(Math.abs(box.x - raster.links)).toBeLessThanOrEqual(TOLERANZ)
  expect(Math.abs(box.x + box.width - raster.rechts)).toBeLessThanOrEqual(TOLERANZ)
})

// ---------- AK-4: Kopfbereich ----------

async function kopfMasse(page: Page) {
  const titel = (await page.getByRole('heading', { level: 1, name: KOPF_TITEL }).boundingBox())!
  const bereitsteller = (await page.getByRole('img', { name: LOGOS.bereitsteller.alternativtext }).boundingBox())!
  const software = (await page.getByRole('img', { name: LOGOS.software.alternativtext }).boundingBox())!
  return { titel, bereitsteller, software }
}

// nacharbeiten-audit-filter E9 (F3, Variante A): 768 px aus der Schleife genommen, dort stehen die Logos über dem Titel.
for (const breite of [1280]) {
  test(`stellt bei ${breite} px das Logo des Bereitstellers links und das der Software rechts neben den Titel`, async ({
    page,
  }) => {
    api = await oeffneStartseitenFall(page, fall('fall1'), { breite })

    const { titel, bereitsteller, software } = await kopfMasse(page)
    expect(bereitsteller.x + bereitsteller.width).toBeLessThanOrEqual(titel.x + TOLERANZ)
    expect(software.x).toBeGreaterThanOrEqual(titel.x + titel.width - TOLERANZ)
    // Dieselbe Zeile: Die Logos überlappen den Titel senkrecht.
    for (const logo of [bereitsteller, software]) {
      expect(logo.y).toBeLessThan(titel.y + titel.height)
      expect(logo.y + logo.height).toBeGreaterThan(titel.y)
    }
  })
}

test('stellt bei 768 px beide Logos oberhalb des Titels, Bereitsteller links von Software', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 768 })

  const { titel, bereitsteller, software } = await kopfMasse(page)
  for (const logo of [bereitsteller, software]) {
    expect(logo.y + logo.height).toBeLessThanOrEqual(titel.y + TOLERANZ)
  }
  expect(bereitsteller.x + bereitsteller.width).toBeLessThanOrEqual(software.x + TOLERANZ)
})

test('stellt bei 360 px Logos und Titel untereinander (Bereitsteller, Titel, Software)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 360 })

  const { titel, bereitsteller, software } = await kopfMasse(page)
  expect(bereitsteller.y + bereitsteller.height).toBeLessThanOrEqual(titel.y + TOLERANZ)
  expect(software.y).toBeGreaterThanOrEqual(titel.y + titel.height - TOLERANZ)
})

test('zeigt den Titel bei 1280 px mindestens 30 px groß', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 1280 })

  const groesse = await page
    .getByRole('heading', { level: 1, name: KOPF_TITEL })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(groesse).toBeGreaterThanOrEqual(30)
})

for (const f of [fall('fall1'), fall('fall6')]) {
  test(`hält die Logos höchstens 96 px hoch mit Alternativtext, width und height (${f.name})`, async ({ page }) => {
    api = await oeffneStartseitenFall(page, f, { breite: 1280 })

    for (const logo of [LOGOS.bereitsteller, LOGOS.software]) {
      const bild = page.getByRole('img', { name: logo.alternativtext })
      await expect(bild).toHaveAttribute('width', String(logo.breite))
      await expect(bild).toHaveAttribute('height', String(logo.hoehe))
      expect((await bild.boundingBox())!.height).toBeLessThanOrEqual(96)
    }
  })
}

test('stellt den Kopfbereich als Fläche mit Rahmen dar (hervorgehoben)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 1280 })

  const flaeche = await page.getByRole('heading', { level: 1, name: KOPF_TITEL }).evaluate((h1) => {
    for (let e = h1.parentElement; e && e.tagName !== 'MAIN'; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (parseFloat(s.borderTopWidth) > 0 && s.backgroundColor !== 'rgba(0, 0, 0, 0)') return true
    }
    return false
  })
  expect(flaeche).toBe(true)
})

// ---------- AK-5: Kennzahlen ----------

async function kennzahlKarten(page: Page) {
  return page.getByRole('region', { name: 'Kennzahlen' }).evaluate((region) =>
    [...region.querySelectorAll('dt')].map((dt) => {
      const karte = (dt.parentElement as HTMLElement).getBoundingClientRect()
      const dd = dt.parentElement?.querySelector('dd') as HTMLElement
      return {
        begriff: dt.textContent?.trim() ?? '',
        x: Math.round(karte.left),
        y: Math.round(karte.top),
        zahl: parseFloat(getComputedStyle(dd).fontSize),
      }
    }),
  )
}

for (const [breite, zeilen] of [
  [1280, 1],
  [768, 2],
  [360, 4],
] as const) {
  test(`stellt die vier Kennzahlkarten bei ${breite} px in ${zeilen} Zeile(n)`, async ({ page }) => {
    api = await oeffneStartseitenFall(page, fall('fall1'), { breite })

    const karten = await kennzahlKarten(page)
    expect(karten.map((k) => k.begriff)).toEqual(['Coins', 'Exemplare gesamt', 'Ausgegeben', 'Verfügbar'])
    expect(new Set(karten.map((k) => k.y)).size).toBe(zeilen)
    expect(new Set(karten.map((k) => k.x)).size).toBe(4 / zeilen)
  })
}

test('zeigt die Kennzahlen mindestens 30 px groß', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 1280 })

  for (const karte of await kennzahlKarten(page)) expect(karte.zahl, karte.begriff).toBeGreaterThanOrEqual(30)
})

test('zeigt die Kennzahlen ohne äußere Blockkarte (die Region selbst hat keinen Rahmen)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 1280 })

  const rahmen = await page
    .getByRole('region', { name: 'Kennzahlen' })
    .evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))
  expect(rahmen).toBe(0)
})

// ---------- AK-6: Neueste Coins ----------

test('zeigt Neueste Coins als volle Zeile bei 1280 px mit mindestens zwei Kacheln nebeneinander (Fall 3)', async ({
  page,
}) => {
  api = await oeffneStartseitenFall(page, fall('fall3'), { breite: 1280 })

  const kacheln = page.getByRole('region', { name: 'Neueste Coins' }).getByRole('listitem')
  const boxen = await Promise.all((await kacheln.all()).map((k) => k.boundingBox()))
  const ersteZeile = boxen.filter((b) => Math.abs(b!.y - boxen[0]!.y) <= TOLERANZ)
  expect(ersteZeile.length).toBeGreaterThanOrEqual(2)
})

test('gibt den Links der Neuesten Coins eine Klickfläche von mindestens 40 × 40 px', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 1280 })

  expect(await zuKleineKlickflaechen(page.getByRole('region', { name: 'Neueste Coins' }))).toEqual([])
})

// ---------- AK-7: Meistausgegebene Coins ----------

test('zeigt die Rangliste ohne Browser-Nummerierung (list-style-type: none)', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 1280 })

  const stil = await page
    .getByRole('region', { name: 'Meistausgegebene Coins' })
    .locator('ol')
    .evaluate((ol) => getComputedStyle(ol).listStyleType)
  expect(stil).toBe('none')
})

test('zeigt je Eintrag die Rangzahl sichtbar und „Platz n“ im zugänglichen Text', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 1280 })

  const eintraege = page.getByRole('region', { name: 'Meistausgegebene Coins' }).getByRole('listitem')
  await expect(eintraege).toHaveCount(5)
  for (let i = 0; i < 5; i++) {
    await expect(eintraege.nth(i)).toContainText(`Platz ${i + 1}`)
    const sichtbar = await eintraege.nth(i).evaluate((li, rang) => {
      const text = (li as HTMLElement).innerText.replace(/\s+/g, ' ')
      return text.startsWith(`${rang} `) || text.startsWith(`${rang}\n`) || text.split(' ')[0] === String(rang)
    }, i + 1)
    expect(sichtbar, `sichtbare Rangzahl ${i + 1}`).toBe(true)
  }
})

test('gibt den Links der Rangliste eine Klickfläche von mindestens 40 × 40 px', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall1'), { breite: 360 })

  expect(await zuKleineKlickflaechen(page.getByRole('region', { name: 'Meistausgegebene Coins' }))).toEqual([])
})

test('zeigt „{n} ausgegeben“ rechtsbündig neben dem Namen', async ({ page }) => {
  api = await oeffneStartseitenFall(page, fall('fall3'), { breite: 1280 })

  const region = page.getByRole('region', { name: 'Meistausgegebene Coins' })
  const link = (await region.getByRole('link', { name: 'Coin Top 1', exact: true }).boundingBox())!
  const wert = (await region.getByText('1.234 ausgegeben', { exact: true }).boundingBox())!
  const flaeche = (await region.getByRole('listitem').first().boundingBox())!
  expect(wert.x).toBeGreaterThan(link.x + link.width)
  expect(flaeche.x + flaeche.width - (wert.x + wert.width)).toBeLessThan(40)
})

// ---------- AK-8: Fehler mit „Erneut versuchen“ ----------

test('lädt nach einem Fehler per „Erneut versuchen“ neu und zeigt die Blöcke', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  api = await richteApiEin(page, BETRACHTER)
  const startseite = await mockeStartseite(page, { bloecke: 500 })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    'Die Startseite konnte nicht geladen werden. Bitte später erneut versuchen.',
  )
  const vorher = startseite.abrufe
  startseite.fehlerBeheben()

  await page.getByRole('button', { name: 'Erneut versuchen' }).click()

  await expect(page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(startseite.abrufe).toBeGreaterThan(vorher)
})
