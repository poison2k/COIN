import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SPEICHER_KATALOG_ANSICHT } from '@/shared/config'
import { useLokaleWahl } from './use-lokale-wahl'

// Feature startseite-listen-pruefung, AK-13 und AK-44 (Abschnitt 4.6, ADR-0044 Punkt 1 und 2):
// `useLokaleWahl(schluessel, erlaubt, standard)` → `[wert, setze]` liest und schreibt eine Bedienvorliebe im
// localStorage mit fester Positivliste. Andere oder fehlende Werte ergeben den Standard. Wirft der Speicherzugriff, gilt
// der Wert nur im Speicher der Komponente, ohne Fehler.

const SCHLUESSEL = 'coin-test-wahl'
const ERLAUBT: Array<'tabelle' | 'karten'> = ['tabelle', 'karten']

function hook() {
  return renderHook(() => useLokaleWahl(SCHLUESSEL, ERLAUBT, 'tabelle'))
}

function gesperrterSpeicher() {
  const fehler = () => {
    throw new DOMException('Der Zugriff auf den Speicher ist gesperrt.', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fehler)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fehler)
}

describe('Konstante (ADR-0044 Punkt 1)', () => {
  it('heißt „coin-katalog-ansicht“', () => {
    expect(SPEICHER_KATALOG_ANSICHT).toBe('coin-katalog-ansicht')
  })
})

describe('Lesen', () => {
  it('liefert ohne gespeicherten Wert den Standard', () => {
    const { result } = hook()

    expect(result.current[0]).toBe('tabelle')
  })

  it('liefert einen gespeicherten erlaubten Wert', () => {
    localStorage.setItem(SCHLUESSEL, 'karten')

    const { result } = hook()

    expect(result.current[0]).toBe('karten')
  })

  it.each(['kacheln', 'Karten', ' karten', '', 'null', '["karten"]'])(
    'liefert bei ungültigem Wert „%s“ den Standard',
    (wert) => {
      localStorage.setItem(SCHLUESSEL, wert)

      const { result } = hook()

      expect(result.current[0]).toBe('tabelle')
    },
  )

  it('liefert bei werfendem Speicher den Standard ohne Fehler', () => {
    gesperrterSpeicher()

    const { result } = hook()

    expect(result.current[0]).toBe('tabelle')
  })
})

describe('Schreiben', () => {
  it('setzt den Wert und schreibt ihn unter dem Schlüssel', () => {
    const { result } = hook()

    act(() => result.current[1]('karten'))

    expect(result.current[0]).toBe('karten')
    expect(localStorage.getItem(SCHLUESSEL)).toBe('karten')
  })

  it('liest den geschriebenen Wert in einer neuen Komponente wieder', () => {
    const erste = hook()
    act(() => erste.result.current[1]('karten'))
    erste.unmount()

    const { result } = hook()

    expect(result.current[0]).toBe('karten')
  })

  it('behält den Wert bei werfendem Speicher im Speicher der Komponente', () => {
    gesperrterSpeicher()
    const { result } = hook()

    act(() => result.current[1]('karten'))

    expect(result.current[0]).toBe('karten')
  })

  it('schreibt nur unter dem eigenen Schlüssel', () => {
    const { result } = hook()

    act(() => result.current[1]('karten'))

    expect(Object.keys(localStorage)).toEqual([SCHLUESSEL])
  })

  it('schreibt keinen Wert außerhalb der Positivliste', () => {
    const { result } = hook()

    // Zur Laufzeit (z. B. aus einem fehlerhaften Aufrufer) darf kein fremder Wert im Speicher landen.
    act(() => (result.current[1] as (wert: string) => void)('kacheln'))

    expect(localStorage.getItem(SCHLUESSEL) ?? 'tabelle').toBe('tabelle')
    expect(result.current[0]).toBe('tabelle')
  })
})
