import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testDatei } from '../../../../test/fakeApi'
import { useDateiUrl } from '../index'

// Feature startseite, AK-29 (entities/startseite/lib/use-datei-url): Object-URL für eine ausgewählte Datei in der
// Vorschau; freigegeben beim Wechsel der Datei und beim Verlassen (Unmount). URL.createObjectURL ist in test/setup.ts
// gemockt („blob:vorschau-n“).

describe('useDateiUrl', () => {
  it('liefert ohne Datei null', () => {
    const { result } = renderHook(() => useDateiUrl(null))

    expect(result.current).toBeNull()
  })

  it('liefert für eine Datei eine Object-URL', () => {
    const datei = testDatei()
    const { result } = renderHook(() => useDateiUrl(datei))

    expect(result.current).toMatch(/^blob:/)
  })

  it('erzeugt für dieselbe Datei bei erneutem Rendern keine neue URL', () => {
    const datei = testDatei()
    const { result, rerender } = renderHook(({ d }) => useDateiUrl(d), { initialProps: { d: datei } })
    const erste = result.current

    rerender({ d: datei })

    expect(result.current).toBe(erste)
  })

  it('gibt die alte URL beim Wechsel der Datei frei', () => {
    const { result, rerender } = renderHook(({ d }) => useDateiUrl(d), {
      initialProps: { d: testDatei() as File | null },
    })
    const alt = result.current

    rerender({ d: testDatei('image/webp', 10, 'b.webp') })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(alt)
    expect(result.current).not.toBe(alt)
  })

  it('gibt die URL beim Entfernen der Datei frei', () => {
    const { result, rerender } = renderHook(({ d }) => useDateiUrl(d), {
      initialProps: { d: testDatei() as File | null },
    })
    const alt = result.current

    rerender({ d: null })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(alt)
    expect(result.current).toBeNull()
  })

  it('gibt die URL beim Unmount frei', () => {
    const datei = testDatei()
    const { result, unmount } = renderHook(() => useDateiUrl(datei))
    const url = result.current

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })
})
