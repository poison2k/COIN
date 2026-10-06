import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button'

export interface BlaetternProps {
  /** Aktuelle Seite, beginnend bei 1. */
  seite: number
  /** Anzahl der Seiten (mindestens 1). */
  seiten: number
  onSeite: (seite: number) => void
  /** Sperrt beide Buttons, z. B. während des Ladens. */
  gesperrt?: boolean
}

/** Blättern mit „Vorherige Seite“, „Seite x von y“ und „Nächste Seite“; am Rand gesperrt. */
export function Blaettern({ seite, seiten, onSeite, gesperrt = false }: BlaetternProps) {
  return (
    <nav aria-label="Seitennavigation" className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={gesperrt || seite <= 1}
        onClick={() => onSeite(seite - 1)}
      >
        <ChevronLeftIcon aria-hidden="true" />
        Vorherige Seite
      </Button>
      <span className="text-sm">{`Seite ${seite} von ${seiten}`}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={gesperrt || seite >= seiten}
        onClick={() => onSeite(seite + 1)}
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
