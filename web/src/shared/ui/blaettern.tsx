import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/shared/ui/button'

export interface BlaetternProps {
  /** Aktuelle Seite, beginnend bei 1 (kann hinter dem Ende liegen). */
  seite: number
  /** Anzahl der Seiten (mindestens 1). */
  seiten: number
  onSeite: (seite: number) => void
  /**
   * Eine Seite wird gerade geladen: Klicks werden ignoriert und die Buttons per `aria-disabled` gesperrt, aber nicht
   * nativ – sonst verliert der fokussierte Button den Fokus an `body` (WCAG 2.4.3).
   */
  laedt?: boolean
}

type Richtung = 'vorherige' | 'naechste'

/**
 * Blättern mit „Vorherige Seite“, „Seite x von y“ und „Nächste Seite“; am Rand nativ gesperrt. Führt ein Klick an den
 * Rand, wandert der Fokus vorher auf den anderen Button (bzw. die Navigation), damit er nicht verloren geht.
 */
export function Blaettern({ seite, seiten, onSeite, laedt = false }: BlaetternProps) {
  const navRef = useRef<HTMLElement>(null)
  const vorherigeRef = useRef<HTMLButtonElement>(null)
  const naechsteRef = useRef<HTMLButtonElement>(null)
  // Button, der den Fokus bekommen soll, sobald er nach dem Laden wieder bedienbar ist.
  const fokusNachLaden = useRef<Richtung | null>(null)

  const vorherigeGesperrt = seite <= 1
  const naechsteGesperrt = seite >= seiten

  useEffect(() => {
    const ziel = fokusNachLaden.current
    if (ziel === null || laedt) return
    fokusNachLaden.current = null
    const button = ziel === 'vorherige' ? vorherigeRef.current : naechsteRef.current
    if (button && !button.disabled && document.activeElement === navRef.current) button.focus()
  }, [seite, seiten, laedt])

  function fokusVomRand(ausloeser: HTMLButtonElement | null, anderer: HTMLButtonElement | null, richtung: Richtung) {
    if (document.activeElement !== ausloeser) return
    if (anderer && !anderer.disabled) {
      anderer.focus()
    } else {
      navRef.current?.focus()
      fokusNachLaden.current = richtung
    }
  }

  function vorherige() {
    if (laedt) return
    const ziel = Math.min(seite - 1, seiten)
    if (ziel <= 1) fokusVomRand(vorherigeRef.current, naechsteRef.current, 'naechste')
    onSeite(ziel)
  }

  function naechste() {
    if (laedt) return
    const ziel = seite + 1
    if (ziel >= seiten) fokusVomRand(naechsteRef.current, vorherigeRef.current, 'vorherige')
    onSeite(ziel)
  }

  return (
    <nav
      ref={navRef}
      aria-label="Seitennavigation"
      tabIndex={-1}
      className="flex flex-wrap items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Button
        ref={vorherigeRef}
        type="button"
        variant="outline"
        size="sm"
        className="aria-disabled:opacity-50"
        disabled={vorherigeGesperrt}
        aria-disabled={laedt && !vorherigeGesperrt ? true : undefined}
        onClick={vorherige}
      >
        <ChevronLeftIcon aria-hidden="true" />
        Vorherige Seite
      </Button>
      <span className="text-sm">{`Seite ${seite} von ${seiten}`}</span>
      <Button
        ref={naechsteRef}
        type="button"
        variant="outline"
        size="sm"
        className="aria-disabled:opacity-50"
        disabled={naechsteGesperrt}
        aria-disabled={laedt && !naechsteGesperrt ? true : undefined}
        onClick={naechste}
      >
        Nächste Seite
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </nav>
  )
}

/** Anzahl der Seiten für `gesamt` Einträge bei `groesse` je Seite (mindestens 1). */
export function seitenAnzahl(gesamt: number, groesse: number): number {
  return Math.max(1, Math.ceil(gesamt / Math.max(1, groesse)))
}
