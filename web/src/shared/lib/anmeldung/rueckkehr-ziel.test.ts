import { describe, expect, it } from 'vitest'
import { sicheresZiel } from './rueckkehr-ziel'

// AK-24 und Abschnitt 7: Rückkehrziel nach der Anmeldung; kein Open Redirect.

describe('sicheresZiel – Ergebnis beginnt nie mit //', () => {
  it.each(['/.//boese.example', '/..//boese.example', '/a/..//boese.example', '/a/b/../..//boese.example'])(
    '%s',
    (ziel) => {
      const ergebnis = sicheresZiel(ziel)

      expect(ergebnis.startsWith('//')).toBe(false)
      expect(new URL(ergebnis, window.location.origin).origin).toBe(window.location.origin)
    },
  )
})

describe('sicheresZiel – erlaubte Ziele', () => {
  it('übernimmt einen relativen Pfad', () => {
    expect(sicheresZiel('/coins')).toBe('/coins')
  })

  it('übernimmt einen Pfad mit Query', () => {
    expect(sicheresZiel('/coins?seite=2&sortierung=name')).toBe('/coins?seite=2&sortierung=name')
  })

  it('übernimmt einen Pfad mit Fragment', () => {
    expect(sicheresZiel('/coins#katalog')).toBe('/coins#katalog')
  })

  it('übernimmt die Startseite', () => {
    expect(sicheresZiel('/')).toBe('/')
  })
})

describe('sicheresZiel – unsichere oder ungültige Ziele führen zu /', () => {
  it.each([
    ['fremde absolute URL', 'https://boese.example/coins'],
    ['protokollrelative URL', '//boese.example/coins'],
    ['Backslash statt Schrägstrich', '/\\boese.example/coins'],
    ['doppelter Backslash', '\\\\boese.example'],
    ['Tabulator im Pfad', '/\t/boese.example'],
    ['Zeilenumbruch im Pfad', '/\n/boese.example'],
    ['javascript-URL', 'javascript:alert(1)'],
    ['data-URL', 'data:text/html,<script>alert(1)</script>'],
    ['Pfad ohne führenden Schrägstrich', 'coins'],
    ['absolute URL derselben Origin', `${window.location.origin}/coins`],
    ['leere Zeichenkette', ''],
    ['Punktsegment vor doppeltem Schrägstrich', '/.//boese.example'],
    ['Elternsegment vor doppeltem Schrägstrich', '/..//boese.example'],
    ['Elternsegment nach Pfad vor doppeltem Schrägstrich', '/a/..//boese.example'],
    ['kodierter Punkt vor doppeltem Schrägstrich', '/%2e//boese.example'],
  ])('%s', (_fall, ziel) => {
    expect(sicheresZiel(ziel)).toBe('/')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['Zahl', 42],
    ['Objekt', { ziel: '/coins' }],
  ])('kein String (%s)', (_fall, ziel) => {
    expect(sicheresZiel(ziel)).toBe('/')
  })
})
