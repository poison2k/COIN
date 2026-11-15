import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KennzahlKarte, KennzahlRaster } from './kennzahl-karte'

// Feature formulare-detailseiten, AK-21 und AK-35 (Abschnitt 4.5, 4.8): `KennzahlRaster` ist eine `dl`, je
// `KennzahlKarte({ begriff, wert, anteil? })` ein Begriff (`dt`) mit Wert (`dd`, nur die Zahl). Mit `anteil` zeigt die
// Karte einen Fortschrittsbalken (role="progressbar") außerhalb der `dd`.

function zeige(anteil?: { wert: number; von: number; text: string }) {
  render(
    <KennzahlRaster>
      <KennzahlKarte begriff="Auflage" wert="1.500" />
      <KennzahlKarte begriff="Ausgegeben" wert="3" />
      <KennzahlKarte begriff="Verfügbar" wert="1.497" anteil={anteil} />
    </KennzahlRaster>,
  )
}

/** Paare aus Begriff und Wert der Beschreibungsliste. */
function paare(): Array<[string, string]> {
  const dl = document.querySelector('dl')
  expect(dl).not.toBeNull()
  return [...(dl as HTMLDListElement).querySelectorAll('dt')].map((dt) => {
    let dd = dt.nextElementSibling
    while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
    // Begriff und Wert können je Karte in einem <div> der dl stehen; dann ist dd das Geschwister im selben div.
    dd ??= dt.parentElement?.querySelector('dd') ?? null
    return [dt.textContent?.trim() ?? '', dd?.textContent?.trim() ?? '']
  })
}

describe('Beschreibungsliste (AK-21)', () => {
  it('rendert genau eine dl', () => {
    zeige()

    expect(document.querySelectorAll('dl')).toHaveLength(1)
  })

  it('zeigt Begriffe und Werte in Reihenfolge, die dd enthält nur die Zahl', () => {
    zeige({ wert: 1497, von: 1500, text: '1.497 von 1.500 verfügbar (100 %)' })

    expect(paare()).toEqual([
      ['Auflage', '1.500'],
      ['Ausgegeben', '3'],
      ['Verfügbar', '1.497'],
    ])
  })
})

describe('Fortschrittsbalken (AK-21)', () => {
  it('zeigt mit anteil einen progressbar mit aria-valuenow und aria-valuemax', () => {
    zeige({ wert: 147, von: 150, text: '147 von 150 verfügbar (98 %)' })

    const balken = screen.getByRole('progressbar')
    expect(balken).toHaveAttribute('aria-valuenow', '147')
    expect(balken).toHaveAttribute('aria-valuemax', '150')
  })

  it('setzt aria-valuetext auf den übergebenen Text', () => {
    zeige({ wert: 147, von: 150, text: '147 von 150 verfügbar (98 %)' })

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '147 von 150 verfügbar (98 %)')
  })

  it('gibt dem progressbar einen zugänglichen Namen', () => {
    zeige({ wert: 147, von: 150, text: '147 von 150 verfügbar (98 %)' })

    expect(screen.getByRole('progressbar')).toHaveAccessibleName()
  })

  it('stellt den progressbar nicht in die dd', () => {
    zeige({ wert: 147, von: 150, text: '147 von 150 verfügbar (98 %)' })

    expect(screen.getByRole('progressbar').closest('dd')).toBeNull()
  })

  it('zeigt ohne anteil keinen progressbar', () => {
    zeige()

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('zeigt den progressbar in der Karte des Begriffs „Verfügbar“', () => {
    zeige({ wert: 147, von: 150, text: '147 von 150 verfügbar (98 %)' })

    const dt = [...document.querySelectorAll('dt')].find((el) => el.textContent?.trim() === 'Verfügbar') as HTMLElement
    const karte = dt.parentElement as HTMLElement
    expect(within(karte).getByRole('progressbar')).toBeInTheDocument()
  })
})
