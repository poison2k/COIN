import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useFormular, useSendeSperre } from './index'

// Feature formulare-detailseiten, AK-4 bis AK-7 und AK-10 (Abschnitt 4.1, ADR-0039 Punkt 1/2): Formular-Hook ohne
// Bibliothek. Angenommene Schnittstelle (ADR-0039 Punkt 1):
//   useFormular({ ausgangswerte, pruefe, reihenfolge }) →
//     { werte, feld(name) → { value, onChange, onBlur, fehler }, geaendert, absenden(handler), setzeServerFehler(f) }
//   useSendeSperre() → { sendet, mitSperre(aktion) }
// Fokus aufs erste fehlerhafte Feld und die Zusammenfassung prüfen die Formular-Tests (`*.muster.test.tsx`) im DOM.

interface Werte {
  name: string
  herausgeber: string
}

const AUSGANG: Werte = { name: '', herausgeber: '' }

/** Prüfregel wie `validiereStammdaten` (nur Pflicht und Länge 5 für den Test). */
function pruefe(werte: Werte): Partial<Record<keyof Werte, string>> {
  const fehler: Partial<Record<keyof Werte, string>> = {}
  if (werte.name.trim() === '') fehler.name = 'Name ist erforderlich.'
  else if (werte.name.length > 5) fehler.name = 'Name darf höchstens 5 Zeichen lang sein.'
  if (werte.herausgeber.trim() === '') fehler.herausgeber = 'Herausgeber ist erforderlich.'
  return fehler
}

function zeige(onSenden: (werte: Werte) => void | Promise<void> = vi.fn()) {
  let aktuell: ReturnType<typeof useFormular<Werte>> | null = null
  function TestFormular() {
    const formular = useFormular<Werte>({
      ausgangswerte: AUSGANG,
      pruefe,
      reihenfolge: ['name', 'herausgeber'],
    })
    aktuell = formular
    const name = formular.feld('name')
    const herausgeber = formular.feld('herausgeber')
    return (
      <form onSubmit={formular.absenden(onSenden)} noValidate>
        <label htmlFor="name">Name</label>
        <input id="name" value={name.value} onChange={name.onChange} onBlur={name.onBlur} />
        {name.fehler && <p>{`Fehler Name: ${name.fehler}`}</p>}
        <label htmlFor="herausgeber">Herausgeber</label>
        <input id="herausgeber" value={herausgeber.value} onChange={herausgeber.onChange} onBlur={herausgeber.onBlur} />
        {herausgeber.fehler && <p>{`Fehler Herausgeber: ${herausgeber.fehler}`}</p>}
        <p>{formular.geaendert ? 'geändert' : 'unverändert'}</p>
        <button type="submit">Speichern</button>
      </form>
    )
  }
  const user = userEvent.setup()
  render(<TestFormular />)
  return {
    user,
    name: screen.getByRole('textbox', { name: 'Name' }),
    herausgeber: screen.getByRole('textbox', { name: 'Herausgeber' }),
    formular: () => aktuell as NonNullable<typeof aktuell>,
  }
}

const fehlerText = (text: string) => screen.queryByText(text, { exact: false })

describe('Validierung beim Verlassen (AK-4, AK-5)', () => {
  it('zeigt vor dem ersten Verlassen keinen Fehler, auch bei ungültigem Wert', async () => {
    const { user, name } = zeige()

    await user.type(name, 'Zu langer Name')

    expect(fehlerText('Name darf höchstens 5 Zeichen lang sein.')).toBeNull()
  })

  it('zeigt beim Verlassen eines unveränderten, leeren Pflichtfelds keinen Fehler', async () => {
    const { user, name } = zeige()

    await user.click(name)
    await user.tab()

    expect(fehlerText('Name ist erforderlich.')).toBeNull()
  })

  it('zeigt nach Eingabe eines ungültigen Werts und Verlassen die Meldung', async () => {
    const { user, name } = zeige()

    await user.type(name, 'Zu langer Name')
    await user.tab()

    expect(fehlerText('Fehler Name: Name darf höchstens 5 Zeichen lang sein.')).not.toBeNull()
  })

  it('zeigt den Fehler auch, wenn ein geändertes Feld wieder geleert und verlassen wird', async () => {
    const { user, name } = zeige()

    await user.type(name, 'A')
    await user.clear(name)
    await user.tab()

    expect(fehlerText('Fehler Name: Name ist erforderlich.')).not.toBeNull()
  })

  it('entfernt den Fehler bei der Eingabe, sobald der Wert gültig ist', async () => {
    const { user, name } = zeige()
    await user.type(name, 'Zu langer Name')
    await user.tab()

    await user.clear(name)
    await user.type(name, 'Alpha')

    expect(fehlerText('Fehler Name:')).toBeNull()
  })

  it('zeigt einen anderen Fehler erst beim nächsten Verlassen', async () => {
    const { user, name } = zeige()
    await user.type(name, 'Zu langer Name')
    await user.tab()

    await user.clear(name)

    expect(fehlerText('Fehler Name: Name ist erforderlich.')).toBeNull()
    await user.tab()
    expect(fehlerText('Fehler Name: Name ist erforderlich.')).not.toBeNull()
  })

  it('prüft beim Verlassen nur das verlassene Feld', async () => {
    const { user, name } = zeige()

    await user.type(name, 'Zu langer Name')
    await user.tab()

    expect(fehlerText('Herausgeber ist erforderlich.')).toBeNull()
  })
})

describe('Absenden (AK-6)', () => {
  it('ruft den Handler bei Fehlern nicht auf', async () => {
    const onSenden = vi.fn()
    const { user } = zeige(onSenden)

    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(onSenden).not.toHaveBeenCalled()
  })

  it('zeigt beim Absenden alle Feldfehler, auch an unberührten Feldern', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(fehlerText('Fehler Name: Name ist erforderlich.')).not.toBeNull()
    expect(fehlerText('Fehler Herausgeber: Herausgeber ist erforderlich.')).not.toBeNull()
  })

  it('ruft den Handler bei gültigen Werten genau einmal mit den Werten auf', async () => {
    const onSenden = vi.fn()
    const { user, name, herausgeber } = zeige(onSenden)
    await user.type(name, 'Alpha')
    await user.type(herausgeber, 'Beta')

    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(onSenden).toHaveBeenCalledTimes(1)
    expect(onSenden).toHaveBeenCalledWith({ name: 'Alpha', herausgeber: 'Beta' })
  })

  it('verhindert das native Absenden (kein Seitenwechsel)', async () => {
    const { user, name, herausgeber } = zeige()
    await user.type(name, 'Alpha')
    await user.type(herausgeber, 'Beta')
    const vorher = window.location.href

    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(window.location.href).toBe(vorher)
  })
})

describe('Server-Feldfehler (AK-5, AK-6)', () => {
  it('zeigt einen Server-Feldfehler am Feld', async () => {
    const { formular } = zeige()

    act(() => formular().setzeServerFehler({ name: 'Ein Coin mit diesem Namen existiert bereits.' }))

    expect(fehlerText('Fehler Name: Ein Coin mit diesem Namen existiert bereits.')).not.toBeNull()
  })

  it('lässt den Server-Feldfehler beim Verlassen ohne Änderung stehen', async () => {
    const { user, name, formular } = zeige()
    act(() => formular().setzeServerFehler({ name: 'Ein Coin mit diesem Namen existiert bereits.' }))

    await user.click(name)
    await user.tab()

    expect(fehlerText('Ein Coin mit diesem Namen existiert bereits.')).not.toBeNull()
  })

  it('entfernt den Server-Feldfehler, sobald das Feld geändert wird', async () => {
    const { user, name, formular } = zeige()
    await user.type(name, 'Alpha')
    act(() => formular().setzeServerFehler({ name: 'Ein Coin mit diesem Namen existiert bereits.' }))

    await user.type(name, 'X')

    expect(fehlerText('Ein Coin mit diesem Namen existiert bereits.')).toBeNull()
  })
})

describe('geaendert (AK-13, AK-14, ADR-0040 Punkt 3)', () => {
  it('ist ohne Eingabe nicht geändert', () => {
    zeige()

    expect(screen.getByText('unverändert')).toBeInTheDocument()
  })

  it('ist nach einer Eingabe geändert', async () => {
    const { user, name } = zeige()

    await user.type(name, 'A')

    expect(screen.getByText('geändert')).toBeInTheDocument()
  })

  it('ist nach Rücksetzen auf den Ausgangswert nicht mehr geändert', async () => {
    const { user, name } = zeige()

    await user.type(name, 'A')
    await user.clear(name)

    expect(screen.getByText('unverändert')).toBeInTheDocument()
  })

  it('vergleicht ohne Trimmen (nur Leerzeichen gilt als Änderung)', async () => {
    const { user, name } = zeige()

    await user.type(name, ' ')

    expect(screen.getByText('geändert')).toBeInTheDocument()
  })
})

describe('useSendeSperre (AK-10)', () => {
  it('meldet während der Aktion sendet = true und danach false', async () => {
    let aufloesen!: () => void
    const { result } = renderHook(() => useSendeSperre())

    let lauf!: Promise<unknown>
    act(() => {
      lauf = result.current.mitSperre(() => new Promise<void>((r) => (aufloesen = r)))
    })
    expect(result.current.sendet).toBe(true)

    await act(async () => {
      aufloesen()
      await lauf
    })
    expect(result.current.sendet).toBe(false)
  })

  it('verwirft eine zweite Aktion synchron, solange die erste läuft', async () => {
    let aufloesen!: () => void
    const aktion = vi.fn(() => new Promise<void>((r) => (aufloesen = r)))
    const { result } = renderHook(() => useSendeSperre())

    let lauf!: Promise<unknown>
    act(() => {
      lauf = result.current.mitSperre(aktion)
      void result.current.mitSperre(aktion)
    })

    expect(aktion).toHaveBeenCalledTimes(1)
    await act(async () => {
      aufloesen()
      await lauf
    })
  })

  it('gibt die Sperre auch nach einem Fehler der Aktion frei', async () => {
    const { result } = renderHook(() => useSendeSperre())

    await act(async () => {
      await result.current.mitSperre(() => Promise.reject(new Error('Netzwerk'))).catch(() => undefined)
    })

    expect(result.current.sendet).toBe(false)
    const zweite = vi.fn(() => Promise.resolve())
    await act(async () => {
      await result.current.mitSperre(zweite)
    })
    await waitFor(() => expect(zweite).toHaveBeenCalledTimes(1))
  })
})
