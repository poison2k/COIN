import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownText } from './markdown'

// Feature startseite, AK-23 und AK-24 (ADR-0031 Punkt 6, Entscheidung S4): eingeschränktes Markdown über react-markdown
// mit remark-breaks. Positivliste der Elemente (p, br, strong, em, ul, ol, li, a), rohes HTML wird entfernt, Link-Ziele
// nur http, https, mailto und relative Pfade mit genau einem „/“. Geprüft wird am gerenderten DOM.

/** Elemente, die MarkdownText erzeugen darf (plus Hülle und sr-only-Hinweis). */
const ERLAUBT = new Set(['DIV', 'P', 'BR', 'STRONG', 'EM', 'UL', 'OL', 'LI', 'A', 'SPAN'])

function zeige(text: string) {
  return render(<MarkdownText text={text} />)
}

/** Alle Elemente unterhalb des Render-Containers. */
function elemente(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('*')]
}

/** Alle Attribute aller Elemente als „tag@name=wert“. */
function attribute(container: HTMLElement): string[] {
  return elemente(container).flatMap((el) => [...el.attributes].map((a) => `${el.tagName}@${a.name}=${a.value}`))
}

afterEach(() => {
  delete (window as unknown as { __xss?: unknown }).__xss
})

// ---------- AK-23: Formatierung ----------

describe('Formatierung', () => {
  it('stellt **fett** als strong dar', () => {
    const { container } = zeige('Ein **fetter** Text')

    expect(container.querySelector('strong')).toHaveTextContent('fetter')
  })

  it('stellt *kursiv* als em dar', () => {
    const { container } = zeige('Ein *kursiver* Text')

    expect(container.querySelector('em')).toHaveTextContent('kursiver')
  })

  it('stellt „- “ als ungeordnete Liste dar', () => {
    zeige('- Erster Punkt\n- Zweiter Punkt')

    const liste = screen.getByRole('list')
    expect(liste.tagName).toBe('UL')
    expect(
      within(liste)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Erster Punkt', 'Zweiter Punkt'])
  })

  it('stellt „1. “ als geordnete Liste dar', () => {
    zeige('1. Eins\n2. Zwei\n3. Drei')

    const liste = screen.getByRole('list')
    expect(liste.tagName).toBe('OL')
    expect(within(liste).getAllByRole('listitem')).toHaveLength(3)
  })

  it('macht aus einer Leerzeile einen neuen Absatz', () => {
    const { container } = zeige('Absatz eins\n\nAbsatz zwei')

    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Absatz eins', 'Absatz zwei'])
  })

  it('macht aus einem einfachen Zeilenumbruch ein br', () => {
    const { container } = zeige('Zeile eins\nZeile zwei')

    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelector('p br')).not.toBeNull()
  })

  it('zeigt eine Überschrift nur als Text ohne Überschriften-Element', () => {
    const { container } = zeige('# Große Überschrift')

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(container).toHaveTextContent('Große Überschrift')
  })

  it('zeigt Code, Zitat und Tabelle nur als Text', () => {
    const { container } = zeige('`code`\n\n> Zitat\n\n| a | b |\n|---|---|\n| 1 | 2 |')

    expect(container.querySelector('code, pre, blockquote, table')).toBeNull()
    expect(container).toHaveTextContent('code')
    expect(container).toHaveTextContent('Zitat')
  })

  it('erzeugt nur Elemente der Positivliste', () => {
    const { container } = zeige(
      '# Titel\n\n**fett** *kursiv* `code`\n\n> Zitat\n\n- a\n1. b\n\n---\n\n[Link](https://example.org) ![Bild](https://example.org/b.png)\n\n<div><b>roh</b></div>',
    )

    const fremd = elemente(container)
      .map((el) => el.tagName)
      .filter((tag) => !ERLAUBT.has(tag))
    expect(fremd).toEqual([])
  })
})

// ---------- AK-23: Links ----------

describe('Links', () => {
  it('stellt einen https-Link mit rel="noopener noreferrer" und target="_blank" dar', () => {
    zeige('[Zur Bundeswehr](https://www.bundeswehr.example)')

    const link = screen.getByRole('link', { name: /Zur Bundeswehr/ })
    expect(link).toHaveAttribute('href', 'https://www.bundeswehr.example')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('stellt einen http-Link ebenfalls mit target="_blank" dar', () => {
    zeige('[Alt](http://alt.example)')

    expect(screen.getByRole('link', { name: /Alt/ })).toHaveAttribute('target', '_blank')
  })

  it('kündigt externe Links mit „(öffnet in neuem Tab)“ an', () => {
    zeige('[Mehr](https://mehr.example)')

    expect(screen.getByRole('link', { name: 'Mehr (öffnet in neuem Tab)' })).toBeInTheDocument()
  })

  it('stellt mailto-Links ohne target, aber mit rel dar', () => {
    zeige('[Schreiben](mailto:kontakt@coin-test.invalid)')

    const link = screen.getByRole('link', { name: 'Schreiben' })
    expect(link).toHaveAttribute('href', 'mailto:kontakt@coin-test.invalid')
    expect(link).not.toHaveAttribute('target')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('stellt relative Pfade mit genau einem „/“ ohne target dar', () => {
    zeige('[Zum Katalog](/coins)')

    const link = screen.getByRole('link', { name: 'Zum Katalog' })
    expect(link).toHaveAttribute('href', '/coins')
    expect(link).not.toHaveAttribute('target')
  })

  it('zeigt bei relativen Links keinen Hinweis auf einen neuen Tab', () => {
    const { container } = zeige('[Zum Katalog](/coins)')

    expect(container).not.toHaveTextContent('öffnet in neuem Tab')
  })

  it.each([
    ['protokollrelativ', '[f](//evil.example)'],
    ['Backslash', '[f](/\\evil.example)'],
    ['javascript:', '[a](javascript:window.__xss=4)'],
    ['JAVASCRIPT:', '[b](JAVASCRIPT:window.__xss=5)'],
    ['mit Tabulator-Entität', '[c](java&#x09;script:window.__xss=6)'],
    ['data:', '[d](data:text/html,<script>window.__xss=7</script>)'],
    ['vbscript:', '[e](vbscript:msgbox)'],
    ['file:', '[g](file:///etc/passwd)'],
  ])('erzeugt für ein unzulässiges Ziel (%s) keinen Link', (_art, text) => {
    const { container } = zeige(text)

    expect(container.querySelector('a')).toBeNull()
  })

  it('zeigt den Linktext eines unzulässigen Ziels als reinen Text', () => {
    const { container } = zeige('Vorher [klick mich](javascript:alert(1)) nachher')

    expect(container).toHaveTextContent('klick mich')
    expect(container.querySelector('a')).toBeNull()
  })

  it('entfernt einen HTML-Link mit javascript:-Ziel', () => {
    const { container } = zeige('<a href="javascript:window.__xss=8">g</a>')

    expect(container.querySelector('a')).toBeNull()
  })
})

// ---------- AK-24: XSS-Nutzlasten ----------

const NUTZLASTEN = [
  '<script>window.__xss=1</script>',
  '<img src=x onerror="window.__xss=2">',
  '<svg onload="window.__xss=3">',
  '<iframe src="javascript:window.__xss=9"></iframe>',
  '[a](javascript:window.__xss=4)',
  '[b](JAVASCRIPT:window.__xss=5)',
  '[c](java&#x09;script:window.__xss=6)',
  '[d](data:text/html,<script>window.__xss=7</script>)',
  '[e](vbscript:msgbox)',
  '[f](//evil.example)',
  '<a href="javascript:window.__xss=8">g</a>',
  '![x](https://evil.example/x.png)',
]

describe('XSS-Nutzlasten (AK-24)', () => {
  it.each(NUTZLASTEN)('erzeugt für %s kein script, img, svg oder iframe', (nutzlast) => {
    const { container } = zeige(nutzlast)

    expect(container.querySelector('script, img, svg, iframe, object, embed, style')).toBeNull()
  })

  it.each(NUTZLASTEN)('erzeugt für %s kein Attribut on*', (nutzlast) => {
    const { container } = zeige(nutzlast)

    expect(attribute(container).filter((a) => /@on/i.test(a))).toEqual([])
  })

  it('lässt im Gesamttext mit allen Nutzlasten nur zulässige href-Ziele zu', () => {
    const { container } = zeige(`${NUTZLASTEN.join('\n\n')}\n\n[ok](https://ok.example) [auch](/coins)`)

    const ziele = [...container.querySelectorAll('[href]')].map((el) => el.getAttribute('href') ?? '')
    expect(ziele.every((ziel) => /^(https?:|mailto:|\/(?![/\\]))/i.test(ziel))).toBe(true)
    expect(ziele).toEqual(['https://ok.example', '/coins'])
  })

  it('setzt window.__xss nicht', () => {
    zeige(NUTZLASTEN.join('\n\n'))

    expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined()
  })

  it('zeigt rohes HTML weder als Element noch als Text', () => {
    const { container } = zeige('Vorher\n\n<script>window.__xss=1</script>\n\nNachher')

    expect(container.querySelector('script')).toBeNull()
    expect(container).not.toHaveTextContent('<script>')
    expect(container).not.toHaveTextContent('window.__xss')
  })

  it('ruft für ein Markdown-Bild nichts ab', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { container } = zeige('![x](https://evil.example/x.png)')

    expect(container.querySelector('[src]')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verweist in keinem Attribut auf evil.example', () => {
    const { container } = zeige(NUTZLASTEN.join('\n\n'))

    expect(attribute(container).filter((a) => a.includes('evil.example'))).toEqual([])
  })
})
