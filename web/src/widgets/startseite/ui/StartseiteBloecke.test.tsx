import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { zeigeMitRouter } from '../../../../test/router'
import {
  infotextBlock,
  kennzahlenBlock,
  kopfBlock,
  meistausgegebenBlock,
  neuerCoin,
  neuesteBlock,
  testLogo,
  topCoin,
  type Block,
} from '../../../../test/startseite'
import { StartseiteBloecke } from '../index'

// Feature startseite, AK-20, AK-21 und AK-33 (Abschnitt 7, Widget StartseiteBloecke { bloecke, ebene }): Blöcke in der
// Reihenfolge der API, Kopfbereich mit Logos, Infotext über MarkdownText, Kennzahlen als <dl>, Listen mit Leerzuständen,
// Überschriftenebenen 1 (Startseite) bzw. 2 (Vorschau). Abschnitte als <section aria-labelledby> bzw. aria-label.

function zeige(bloecke: Block[], ebene: 1 | 2 = 1) {
  return zeigeMitRouter(() => <StartseiteBloecke bloecke={bloecke} ebene={ebene} />)
}

/** Wert zu einem Begriff der Beschreibungsliste (<dt> → folgendes <dd>). */
function wertZu(begriff: string): string | undefined {
  const dt = [...document.querySelectorAll('dl dt')].find((el) => el.textContent?.trim() === begriff)
  let dd = dt?.nextElementSibling ?? null
  while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
  return dd?.textContent?.trim()
}

describe('Reihenfolge und Auswahl (AK-2, AK-20)', () => {
  it('zeigt die Blöcke in der Reihenfolge der API', async () => {
    zeige([meistausgegebenBlock(), infotextBlock(), kennzahlenBlock(), neuesteBlock()])

    await screen.findByRole('region', { name: 'Kennzahlen' })
    const regionen = screen.getAllByRole('region')
    expect(regionen.map((r) => within(r).queryByRole('heading')?.textContent ?? r.getAttribute('aria-label'))).toEqual([
      'Meistausgegebene Coins',
      'Information',
      'Kennzahlen',
      'Neueste Coins',
    ])
  })

  it('zeigt nur die übergebenen Blöcke', async () => {
    zeige([infotextBlock(), neuesteBlock()])

    await screen.findByRole('region', { name: 'Neueste Coins' })
    expect(screen.queryByRole('region', { name: 'Kennzahlen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Meistausgegebene Coins' })).not.toBeInTheDocument()
  })

  it('zeigt ohne Blöcke keinen Abschnitt', async () => {
    const { router } = zeige([])

    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(screen.queryAllByRole('region')).toHaveLength(0)
  })
})

describe('Überschriften (AK-21, AK-29)', () => {
  it('macht auf Ebene 1 den Titel des Kopfbereichs zum einzigen h1', async () => {
    zeige([kopfBlock({ titel: 'Testverband Gedenkmünzen' }), kennzahlenBlock()])

    expect(await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('setzt auf Ebene 1 die Blocküberschriften als h2', async () => {
    zeige([kopfBlock(), kennzahlenBlock(), neuesteBlock(), meistausgegebenBlock()])

    await screen.findByRole('heading', { level: 2, name: 'Kennzahlen' })
    expect(screen.getByRole('heading', { level: 2, name: 'Neueste Coins' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Meistausgegebene Coins' })).toBeInTheDocument()
  })

  it('hat auf Ebene 2 kein h1', async () => {
    zeige([kopfBlock({ titel: 'Vorschautitel' }), kennzahlenBlock()], 2)

    await screen.findByRole('heading', { level: 2, name: 'Vorschautitel' })
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('setzt auf Ebene 2 die Blocküberschriften eine Ebene tiefer', async () => {
    zeige([kopfBlock(), kennzahlenBlock()], 2)

    expect(await screen.findByRole('heading', { level: 3, name: 'Kennzahlen' })).toBeInTheDocument()
  })

  it('verknüpft jeden Block-Abschnitt über aria-labelledby mit seiner Überschrift', async () => {
    zeige([kennzahlenBlock(), neuesteBlock(), meistausgegebenBlock()])

    for (const name of ['Kennzahlen', 'Neueste Coins', 'Meistausgegebene Coins']) {
      const region = await screen.findByRole('region', { name })
      const id = region.getAttribute('aria-labelledby')
      expect(id).toBeTruthy()
      expect(document.getElementById(id ?? '')).toHaveTextContent(name)
    }
  })

  it('stellt den Infotext als Abschnitt „Information“ ohne Überschrift dar', async () => {
    zeige([infotextBlock('Ein **wichtiger** Hinweis')])

    const region = await screen.findByRole('region', { name: 'Information' })
    expect(within(region).queryByRole('heading')).not.toBeInTheDocument()
    expect(region.querySelector('strong')).toHaveTextContent('wichtiger')
  })
})

describe('Kopfbereich (AK-20)', () => {
  it('zeigt den Untertitel', async () => {
    zeige([kopfBlock({ untertitel: 'Untertitel Test' })])

    expect(await screen.findByText('Untertitel Test')).toBeInTheDocument()
  })

  it('zeigt das Logo des Bereitstellers per img mit Alternativtext, src, width und height aus der API', async () => {
    zeige([kopfBlock({ logoBereitsteller: testLogo('bereitsteller', { breite: 400, hoehe: 480 }) })])

    const logo = await screen.findByRole('img', { name: 'Wappen des Testverbands' })
    expect(logo).toHaveAttribute('src', '/api/startseite/logos/bereitsteller?v=0123456789abcdef')
    expect(logo).toHaveAttribute('width', '400')
    expect(logo).toHaveAttribute('height', '480')
  })

  it('zeigt das Logo des Bereitstellers vor dem Titel und das Logo der Software danach', async () => {
    zeige([
      kopfBlock({
        titel: 'Titel Mitte',
        logoBereitsteller: testLogo('bereitsteller'),
        logoSoftware: testLogo('software'),
      }),
    ])

    const titel = await screen.findByRole('heading', { level: 1, name: 'Titel Mitte' })
    const links = screen.getByRole('img', { name: 'Wappen des Testverbands' })
    const rechts = screen.getByRole('img', { name: 'Logo der Testsoftware' })
    expect(links.compareDocumentPosition(titel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(titel.compareDocumentPosition(rechts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('zeigt ohne Logos kein img im Kopfbereich', async () => {
    zeige([kopfBlock()])

    await screen.findByRole('heading', { level: 1, name: 'C.O.I.N.' })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('zeigt Titel, Untertitel und Alternativtext mit XSS-Nutzlast als reinen Text', async () => {
    const nutzlast = '<img src=x onerror="window.__xss=2"><script>window.__xss=1</script>'
    const { container } = zeige([
      kopfBlock({
        titel: nutzlast,
        untertitel: nutzlast,
        logoBereitsteller: testLogo('bereitsteller', { alternativtext: nutzlast }),
      }),
    ])

    expect(await screen.findByRole('heading', { level: 1, name: nutzlast })).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined()
  })
})

describe('Kennzahlen (AK-20)', () => {
  it('zeigt Coins, Exemplare gesamt, Ausgegeben und Verfügbar als Beschreibungsliste', async () => {
    zeige([kennzahlenBlock()])

    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect([...document.querySelectorAll('dl dt')].map((dt) => dt.textContent?.trim())).toEqual([
      'Coins',
      'Exemplare gesamt',
      'Ausgegeben',
      'Verfügbar',
    ])
  })

  it('zeigt die Werte im deutschen Zahlenformat', async () => {
    zeige([kennzahlenBlock({ coins: 3, exemplare: 1_000_450, ausgegeben: 12_000, verfuegbar: 988_450 })])

    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect([wertZu('Coins'), wertZu('Exemplare gesamt'), wertZu('Ausgegeben'), wertZu('Verfügbar')]).toEqual([
      '3',
      '1.000.450',
      '12.000',
      '988.450',
    ])
  })
})

describe('Neueste Coins (AK-20)', () => {
  it('verlinkt jeden Namen auf die Detailseite', async () => {
    const coin = neuerCoin(7)
    zeige([neuesteBlock([coin])])

    expect(await screen.findByRole('link', { name: 'Coin Neu 7' })).toHaveAttribute('href', `/coins/${coin.id}`)
  })

  it('zeigt den Herausgeber', async () => {
    zeige([neuesteBlock([neuerCoin(7)])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })
    expect(within(region).getByText('Herausgeber 7')).toBeInTheDocument()
  })

  it('zeigt die Einträge als Liste in der Reihenfolge der API', async () => {
    zeige([neuesteBlock([neuerCoin(3), neuerCoin(1), neuerCoin(2)])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })
    expect(
      within(region)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Coin Neu 3', 'Coin Neu 1', 'Coin Neu 2'])
    expect(within(region).getAllByRole('listitem')).toHaveLength(3)
  })

  it('zeigt das Motivbild dekorativ mit alt=""', async () => {
    zeige([neuesteBlock([neuerCoin(1, { bildUrl: '/api/coins/x/bild?v=abc' })])])

    const region = await screen.findByRole('region', { name: 'Neueste Coins' })
    const bild = region.querySelector('img')
    expect(bild).toHaveAttribute('src', '/api/coins/x/bild?v=abc')
    expect(bild).toHaveAttribute('alt', '')
  })

  it('zeigt ohne Einträge „Noch keine Coins im Katalog.“', async () => {
    zeige([neuesteBlock([])])

    expect(await screen.findByText('Noch keine Coins im Katalog.')).toBeInTheDocument()
  })
})

describe('Meistausgegebene Coins (AK-20)', () => {
  it('zeigt die Rangliste als geordnete Liste', async () => {
    zeige([meistausgegebenBlock([topCoin(1, 7), topCoin(2, 5)])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })
    expect(within(region).getByRole('list').tagName).toBe('OL')
  })

  it('zeigt je Eintrag den Namen als Link und „{n} ausgegeben“', async () => {
    const coin = topCoin(1, 1234)
    zeige([meistausgegebenBlock([coin])])

    const region = await screen.findByRole('region', { name: 'Meistausgegebene Coins' })
    expect(within(region).getByRole('link', { name: 'Coin Top 1' })).toHaveAttribute('href', `/coins/${coin.id}`)
    expect(within(region).getByText('1.234 ausgegeben')).toBeInTheDocument()
  })

  it('zeigt ohne Einträge „Noch keine Coins ausgegeben.“', async () => {
    zeige([meistausgegebenBlock([])])

    expect(await screen.findByText('Noch keine Coins ausgegeben.')).toBeInTheDocument()
  })
})
