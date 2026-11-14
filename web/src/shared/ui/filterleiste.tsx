import { XIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'

// Filterleiste (formulare-detailseiten, Abschnitt 4.7, ADR-0041 Punkt 4, AK-33): Filterbedienelemente, darunter die
// aktiven Filter als Chips in <ul aria-label="Aktive Filter">. Je Chip ein Entfernen-Button (≥ 40 × 40 px), ab zwei
// Chips „Alle Filter entfernen“. Nach dem Entfernen geht der Fokus auf den nächsten Chip, sonst auf das erste
// Filterbedienelement – jeweils, sobald der Aufrufer den Chip entfernt hat.

export interface FilterChip {
  id: string
  /** „{Filter}: {Wert}“ */
  text: string
  onEntfernen: () => void
}

export interface FilterleisteProps {
  /** Filterbedienelemente (Suche, Auswahl …). */
  children: ReactNode
  chips: ReadonlyArray<FilterChip>
  onAlleEntfernen?: () => void
  className?: string
}

const FOKUSSIERBAR =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

type FokusZiel = { art: 'chip'; id: string; entfernt: string[] } | { art: 'bedienelement'; entfernt: string[] }

export function Filterleiste({ children, chips, onAlleEntfernen, className }: FilterleisteProps) {
  const bedienRef = useRef<HTMLDivElement>(null)
  const listeRef = useRef<HTMLUListElement>(null)
  const fokusZiel = useRef<FokusZiel | null>(null)

  const chipIds = chips.map((c) => c.id).join('|')
  useEffect(() => {
    const ziel = fokusZiel.current
    if (!ziel) return
    const aktuell = chipIds === '' ? [] : chipIds.split('|')
    // Erst wenn der Aufrufer die entfernten Chips nicht mehr zeigt (er lädt ggf. erst neu).
    if (ziel.entfernt.some((id) => aktuell.includes(id))) return
    fokusZiel.current = null
    if (ziel.art === 'chip') {
      const knopf = listeRef.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(ziel.id)}"]`)
      if (knopf) {
        knopf.focus()
        return
      }
    }
    bedienRef.current?.querySelector<HTMLElement>(FOKUSSIERBAR)?.focus()
  }, [chipIds])

  function entferne(index: number) {
    const chip = chips[index]
    const naechster = chips[index + 1] ?? chips[index - 1]
    fokusZiel.current = naechster
      ? { art: 'chip', id: naechster.id, entfernt: [chip.id] }
      : { art: 'bedienelement', entfernt: [chip.id] }
    chip.onEntfernen()
  }

  function alleEntfernen() {
    fokusZiel.current = { art: 'bedienelement', entfernt: chips.map((c) => c.id) }
    onAlleEntfernen?.()
  }

  return (
    <div data-slot="filterleiste" className={cn('grid gap-3', className)}>
      <div ref={bedienRef} className="flex flex-wrap items-end gap-2">
        {children}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ul ref={listeRef} aria-label="Aktive Filter" className="flex flex-wrap items-center gap-2">
            {chips.map((chip, index) => (
              <li key={chip.id}>
                <Badge variant="neutral" className="h-10 gap-0 pr-0 pl-3 text-sm">
                  <span>{chip.text}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-chip={chip.id}
                    className="rounded-full"
                    aria-label={`Filter „${chip.text}“ entfernen`}
                    onClick={() => entferne(index)}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </Badge>
              </li>
            ))}
          </ul>
          {chips.length >= 2 && onAlleEntfernen && (
            <Button type="button" variant="ghost" onClick={alleEntfernen}>
              Alle Filter entfernen
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
