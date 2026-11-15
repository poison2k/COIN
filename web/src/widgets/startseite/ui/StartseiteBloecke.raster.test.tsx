import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { zeigeMitRouter } from '../../../../test/router'
import {
  infotextBlock,
  kennzahlenBlock,
  kopfBlock,
  meistausgegebenBlock,
  neuerCoin,
  neuesteBlock,
  topCoin,
  type Block,
} from '../../../../test/startseite'
import { StartseiteBloecke } from '../index'

// Feature startseite-listen-pruefung, AK-3, AK-5 bis AK-7 und AK-9 (Abschnitt 4.1): Zeilen im DOM (neueste und
// meistausgegeben teilen sich nur bei direkter Folge ein Zeilenelement), Leerzustände als h3, Kennzahlen als vier Karten
// in einer dl ohne Blockkarte, Neueste als Kacheln mit Link und Herausgeber, Meistausgegebene als Rangliste mit
// sichtbarer Rangzahl und „Platz n“ für Screenreader. Die Vorschau (Ebene 2) bildet dieselben Zeilen.

function zeige(bloecke: Block[], ebene: 1 | 2 = 1) {
  return zeigeMitRouter(() => <StartseiteBloecke bloecke={bloecke} ebene={ebene} />)
}

/** Bezugselement eines Blocks: die Region bzw. beim Kopf die Titelüberschrift. */
function anker(name: string): HTMLElement {
  return name === 'kopf' ? screen.getAllByRole('heading')[0] : screen.getByRole('region', { name })
}

/** Kleinster gemeinsamer Vorfahr zweier Elemente. */
function gemeinsamerVorfahr(a: Element, b: Element): Element {
  let e: Element | null = a
  while (e && !e.contains(b)) e = e.parentElement
  expect(e, 'kein gemeinsamer Vorfahr').not.toBeNull()
  return e as Element
}

/** Zellen, die ein Element enthält (Anker der übrigen Blöcke). */
function enthaelt(element: Element, anderes: Element): boolean {
  return element !== anderes && element.contains(anderes)
}

// ---------- Zeilen im DOM (AK-1/AK-2 im Widget) ----------

describe('Zeilen im DOM (AK-2)', () => {
  it('fasst Neueste und Meistausgegebene bei direkter Folge in einem eigenen Zeilenelement zusammen', async () => {
    zeige([kopfBlock({ titel: 'Testkopf' }), neuesteBlock(), meistausgegebenBlock()])
    await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    const zeile = gemeinsamerVorfahr(anker('Neueste Coins'), anker('Meistausgegebene Coins'))

    expect(enthaelt(zeile, screen.getByRole('heading', { level: 1, name: 'Testkopf' }))).toBe(false)
  })

  it('fasst das Paar auch in umgekehrter Reihenfolge zusammen', async () => {
    zeige([kennzahlenBlock(), meistausgegebenBlock(), neuesteBlock()])
    await screen.findByRole('region', { name: 'Neueste Coins' })

    const zeile = gemeinsamerVorfahr(anker('Meistausgegebene Coins'), anker('Neueste Coins'))

    expect(enthaelt(zeile, anker('Kennzahlen'))).toBe(false)
  })

  it('gibt den Kennzahlen eine eigene Zeile, auch wenn Neueste und Meistausgegebene folgen', async () => {
    zeige([kennzahlenBlock(), neuesteBlock(), meistausgegebenBlock()])
    await screen.findByRole('region', { name: 'Kennzahlen' })

    const paar = gemeinsamerVorfahr(anker('Neueste Coins'), anker('Meistausgegebene Coins'))

    expect(enthaelt(paar, anker('Kennzahlen'))).toBe(false)
  })

  it('stellt Kopf, Infotext und Kennzahlen je in eine Zeile ohne weiteren Block', async () => {
    zeige([kopfBlock({ titel: 'Testkopf' }), infotextBlock(), kennzahlenBlock()])
    await screen.findByRole('region', { name: 'Kennzahlen' })

    const kopf = screen.getByRole('heading', { level: 1, name: 'Testkopf' })
    const info = anker('Information')
    const zahlen = anker('Kennzahlen')
    // Die drei Blöcke liegen in verschiedenen Zeilen: Zwei von ihnen teilen sich nie ein Element, das nicht auch den
    // dritten enthält (sonst stünden zwei in einer Zeile).
    const raster = gemeinsamerVorfahr(gemeinsamerVorfahr(kopf, info), zahlen)
    expect(gemeinsamerVorfahr(kopf, info)).toBe(raster)
    expect(gemeinsamerVorfahr(info, zahlen)).toBe(raster)
    expect(gemeinsamerVorfahr(kopf, zahlen)).toBe(raster)
  })
})

// ---------- AK-3: Deaktivierte und leere Blöcke ----------

describe('Deaktivierte und leere Blöcke (AK-3)', () => {
  it('rendert nicht übergebene (deaktivierte) Blöcke nicht', async () => {
    zeige([kopfBlock(), meistausgegebenBlock()])
    await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    expect(screen.queryByRole('region', { name: 'Kennzahlen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Information' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Neueste Coins' })).not.toBeInTheDocument()
  })

  it('zeigt „Noch keine Coins im Katalog.“ im leeren Block „Neueste Coins“ als h3', async () => {
    zeige([neuesteBlock([])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })

    expect(within(region).getByRole('heading', { level: 3, name: 'Noch keine Coins im Katalog.' })).toBeInTheDocument()
  })

  it('zeigt „Noch keine Coins ausgegeben.“ im leeren Block „Meistausgegebene Coins“ als h3', async () => {
    zeige([meistausgegebenBlock([])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    expect(within(region).getByRole('heading', { level: 3, name: 'Noch keine Coins ausgegeben.' })).toBeInTheDocument()
  })

  it('zeigt im leeren Block „Neueste Coins“ keinen Link', async () => {
    zeige([neuesteBlock([])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })

    expect(within(region).queryAllByRole('link')).toHaveLength(0)
  })
})

// ---------- AK-5: Kennzahlen ----------

describe('Kennzahlen (AK-5)', () => {
  function paare(region: HTMLElement): Array<[string, string]> {
    const listen = region.querySelectorAll('dl')
    expect(listen).toHaveLength(1)
    return [...listen[0].querySelectorAll('dt')].map((dt) => {
      const dd = dt.parentElement?.querySelector('dd') ?? dt.nextElementSibling
      return [dt.textContent?.trim() ?? '', dd?.textContent?.trim() ?? '']
    })
  }

  it('zeigt genau vier Begriffe in der Reihenfolge Coins, Exemplare gesamt, Ausgegeben, Verfügbar in einer dl', async () => {
    zeige([kennzahlenBlock({ coins: 1234, exemplare: 45678, ausgegeben: 9, verfuegbar: 45669 })])

    const region = await screen.findByRole('region', { name: 'Kennzahlen' })

    expect(paare(region).map(([begriff]) => begriff)).toEqual(['Coins', 'Exemplare gesamt', 'Ausgegeben', 'Verfügbar'])
  })

  it('enthält in jeder dd nur die Zahl im Format de-DE', async () => {
    zeige([kennzahlenBlock({ coins: 1234, exemplare: 45678, ausgegeben: 9, verfuegbar: 45669 })])

    const region = await screen.findByRole('region', { name: 'Kennzahlen' })

    expect(paare(region).map(([, wert]) => wert)).toEqual(['1.234', '45.678', '9', '45.669'])
  })

  it('stellt jede Kennzahl als eigene Karte (eigenes Element mit Begriff und Wert) dar', async () => {
    zeige([kennzahlenBlock()])

    const region = await screen.findByRole('region', { name: 'Kennzahlen' })
    const begriffe = [...region.querySelectorAll('dt')]

    // Je Karte ein Element, das genau einen Begriff und seinen Wert enthält (KennzahlKarte), nicht eine Liste
    // „Begriff – Zahl“ mit display: contents.
    for (const dt of begriffe) {
      const karte = dt.parentElement as HTMLElement
      expect(karte.tagName).not.toBe('DL')
      expect(karte.querySelectorAll('dt')).toHaveLength(1)
      expect(karte.querySelectorAll('dd')).toHaveLength(1)
    }
  })

  it('zeigt keinen Fortschrittsbalken', async () => {
    zeige([kennzahlenBlock()])

    const region = await screen.findByRole('region', { name: 'Kennzahlen' })

    expect(within(region).queryAllByRole('progressbar')).toHaveLength(0)
  })
})

// ---------- AK-6: Neueste Coins ----------

describe('Neueste Coins (AK-6)', () => {
  it('zeigt je Eintrag den Namen als Link auf /coins/{id} in der Reihenfolge der API', async () => {
    zeige([neuesteBlock([neuerCoin(3), neuerCoin(1), neuerCoin(2)])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })
    const links = within(region).getAllByRole('link')

    expect(links.map((l) => l.textContent?.trim())).toEqual(['Coin Neu 3', 'Coin Neu 1', 'Coin Neu 2'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      `/coins/${neuerCoin(3).id}`,
      `/coins/${neuerCoin(1).id}`,
      `/coins/${neuerCoin(2).id}`,
    ])
  })

  it('zeigt je Eintrag den Herausgeber in derselben Kachel', async () => {
    zeige([neuesteBlock([neuerCoin(1), neuerCoin(2)])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })
    const kacheln = within(within(region).getByRole('list')).getAllByRole('listitem')

    expect(kacheln).toHaveLength(2)
    expect(kacheln[0]).toHaveTextContent('Herausgeber 1')
    expect(kacheln[1]).toHaveTextContent('Herausgeber 2')
  })

  it('zeigt das Motivbild dekorativ mit alt=""', async () => {
    zeige([neuesteBlock([neuerCoin(1, { bildUrl: '/api/coins/x/bild?v=1' })])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })
    const bild = region.querySelector('img')

    expect(bild).not.toBeNull()
    expect(bild).toHaveAttribute('alt', '')
  })

  it('macht nicht die ganze Kachel zum Link (genau ein Link je Kachel, um den Namen)', async () => {
    zeige([neuesteBlock([neuerCoin(1)])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })
    const kachel = within(region).getAllByRole('listitem')[0]

    expect(within(kachel).getAllByRole('link')).toHaveLength(1)
    expect(within(kachel).getByRole('link')).toHaveAccessibleName('Coin Neu 1')
  })
})

// ---------- AK-7: Meistausgegebene Coins ----------

describe('Meistausgegebene Coins als Rangliste (AK-7)', () => {
  function eintraege(region: HTMLElement): HTMLElement[] {
    const liste = region.querySelector('ol')
    expect(liste, 'Rangliste ist kein <ol>').not.toBeNull()
    return within(liste as HTMLElement).getAllByRole('listitem')
  }

  it('zeigt eine geordnete Liste <ol> in der Reihenfolge der API', async () => {
    zeige([meistausgegebenBlock([topCoin(1, 1234), topCoin(2, 7), topCoin(3, 1)])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    expect(eintraege(region).map((li) => within(li).getByRole('link').textContent?.trim())).toEqual([
      'Coin Top 1',
      'Coin Top 2',
      'Coin Top 3',
    ])
  })

  it('zeigt je Eintrag die Rangzahl sichtbar und „Platz {n}“ für Screenreader', async () => {
    zeige([meistausgegebenBlock([topCoin(1, 9), topCoin(2, 7), topCoin(3, 5)])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    eintraege(region).forEach((li, index) => {
      const rang = String(index + 1)
      expect(li.textContent?.replace(/\s+/g, ' ')).toContain(`Platz ${rang}`)
      // Sichtbare Rangzahl: ein Element, dessen sichtbarer Text genau die Zahl ist (das Präfix „Platz “ ist sr-only).
      const sichtbar = [...li.querySelectorAll('*')].some(
        (el) =>
          el.children.length === 0 &&
          el.textContent?.trim() === rang &&
          !(el as HTMLElement).className.toString().includes('sr-only'),
      )
      expect(sichtbar, `sichtbare Rangzahl ${rang}`).toBe(true)
    })
  })

  it('blendet das Präfix „Platz “ nur für Screenreader ein', async () => {
    zeige([meistausgegebenBlock([topCoin(1, 9)])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })
    const praefix = [...region.querySelectorAll('ol li *')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Platz',
    )

    expect(praefix, 'Präfix „Platz“ als eigenes Element').toBeDefined()
    expect((praefix as HTMLElement).className.toString()).toContain('sr-only')
  })

  it('nennt im Link nur den Coin-Namen, ohne Rang', async () => {
    zeige([meistausgegebenBlock([topCoin(1, 9), topCoin(2, 7)])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })
    const links = within(region).getAllByRole('link')

    expect(links[0]).toHaveAccessibleName('Coin Top 1')
    expect(links[1]).toHaveAccessibleName('Coin Top 2')
  })

  it('zeigt „{n} ausgegeben“ als eigenes Element mit Zahl im Format de-DE', async () => {
    zeige([meistausgegebenBlock([topCoin(1, 1234)])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    expect(within(region).getByText('1.234 ausgegeben', { exact: true })).toBeInTheDocument()
  })

  it('verlinkt jeden Eintrag auf /coins/{id}', async () => {
    zeige([meistausgegebenBlock([topCoin(1, 9)])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    expect(within(region).getByRole('link', { name: 'Coin Top 1' })).toHaveAttribute(
      'href',
      `/coins/${topCoin(1, 9).id}`,
    )
  })
})

// ---------- AK-9: Vorschau ----------

describe('Vorschau (Ebene 2, AK-9)', () => {
  it('fasst auch in der Vorschau Neueste und Meistausgegebene in einer Zeile ohne den Kopf zusammen', async () => {
    zeige([kopfBlock({ titel: 'Vorschaukopf' }), neuesteBlock(), meistausgegebenBlock()], 2)
    await screen.findByRole('region', { name: 'Meistausgegebene Coins' })

    const zeile = gemeinsamerVorfahr(anker('Neueste Coins'), anker('Meistausgegebene Coins'))

    expect(enthaelt(zeile, screen.getByRole('heading', { level: 2, name: 'Vorschaukopf' }))).toBe(false)
  })

  it('trennt in der Vorschau getrennte Paarblöcke wie auf der Startseite', async () => {
    zeige([neuesteBlock(), kennzahlenBlock(), meistausgegebenBlock()], 2)
    await screen.findByRole('region', { name: 'Kennzahlen' })

    const zeile = gemeinsamerVorfahr(anker('Neueste Coins'), anker('Meistausgegebene Coins'))

    expect(enthaelt(zeile, anker('Kennzahlen'))).toBe(true)
  })

  it('zeigt in der Vorschau die Leerzustände nicht als h2', async () => {
    zeige([neuesteBlock([])], 2)

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })

    expect(within(region).queryByRole('heading', { level: 2, name: 'Noch keine Coins im Katalog.' })).toBeNull()
    expect(within(region).getByRole('heading', { name: 'Noch keine Coins im Katalog.' })).toBeInTheDocument()
  })
})
