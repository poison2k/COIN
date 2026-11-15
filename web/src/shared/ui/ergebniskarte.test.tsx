import { render, screen } from '@testing-library/react'
import { BanIcon, CircleCheckIcon, SearchXIcon, TriangleAlertIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Ergebniskarte } from './ergebniskarte'

// Feature startseite-listen-pruefung, AK-23, AK-24 und AK-38 (Abschnitt 4.3, 4.6): `Ergebniskarte({ ton, icon, titel,
// titelEbene?, children })` ist eine Karte mit Kopf (Icon im Kreis, Titel als Überschrift, Standard h2) und Inhalt. Das
// Icon ist dekorativ (aria-hidden); Titel und Icon unterscheiden die Ergebnisse, die Farbe kommt hinzu.

const TOENE = [
  ['erfolg', CircleCheckIcon, 'lucide-circle-check'],
  ['gefahr', BanIcon, 'lucide-ban'],
  ['warnung', TriangleAlertIcon, 'lucide-triangle-alert'],
  ['neutral', SearchXIcon, 'lucide-search-x'],
] as const

describe('Ergebniskarte', () => {
  it('zeigt den Titel standardmäßig als h2', () => {
    render(
      <Ergebniskarte ton="erfolg" icon={CircleCheckIcon} titel="Zertifikat gültig">
        Inhalt
      </Ergebniskarte>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeInTheDocument()
  })

  it('zeigt den Titel mit titelEbene={3} als h3', () => {
    render(
      <Ergebniskarte ton="neutral" icon={SearchXIcon} titel="Beispiel" titelEbene={3}>
        Inhalt
      </Ergebniskarte>,
    )

    expect(screen.getByRole('heading', { level: 3, name: 'Beispiel' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('zeigt den Inhalt unter dem Kopf', () => {
    render(
      <Ergebniskarte ton="erfolg" icon={CircleCheckIcon} titel="Zertifikat gültig">
        <p>Geprüfte Nummer: AB 12-34</p>
      </Ergebniskarte>,
    )

    const titel = screen.getByRole('heading', { level: 2 })
    const inhalt = screen.getByText('Geprüfte Nummer: AB 12-34')
    expect(titel.compareDocumentPosition(inhalt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each(TOENE)('zeigt beim Ton „%s“ das übergebene Icon genau einmal und aria-hidden', (ton, icon, klasse) => {
    const { container } = render(
      <Ergebniskarte ton={ton} icon={icon} titel={`Titel ${ton}`}>
        Inhalt
      </Ergebniskarte>,
    )

    const icons = container.querySelectorAll(`svg.${klasse}`)
    expect(icons).toHaveLength(1)
    expect(icons[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('nennt die Überschrift nur mit dem Titel (das Icon trägt keinen Namen)', () => {
    render(
      <Ergebniskarte ton="gefahr" icon={BanIcon} titel="Ausgabe storniert, Zertifikat ungültig">
        Inhalt
      </Ergebniskarte>,
    )

    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName('Ausgabe storniert, Zertifikat ungültig')
  })

  it('ist selbst keine Überschrift-Landmarke und kein header', () => {
    const { container } = render(
      <Ergebniskarte ton="warnung" icon={TriangleAlertIcon} titel="Hinweis">
        Inhalt
      </Ergebniskarte>,
    )

    expect(container.querySelector('header')).toBeNull()
  })
})
