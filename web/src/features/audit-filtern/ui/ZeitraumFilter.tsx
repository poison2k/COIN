import { useId, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { FieldDescription, FieldLegend, FieldSet } from '@/shared/ui/field'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'

const HILFETEXT = 'Ganze Tage nach deutscher Zeit, höchstens 366 Tage.'
const MIN = '2000-01-01'
const MAX = '2999-12-31'
const DATUM = /^\d{4}-\d{2}-\d{2}$/

/** Zeitraum als Kalendertage JJJJ-MM-TT; fehlende Werte = nicht angegeben. */
export interface Zeitraum {
  von?: string
  bis?: string
}

export interface ZeitraumFilterProps {
  wert: Zeitraum
  onWert: (wert: Zeitraum) => void
  /** Feldfehler der API (`errors.von`, `errors.bis`). */
  fehler?: { von?: string; bis?: string }
  className?: string
}

/**
 * Zeitraumfilter des Änderungsprotokolls (nacharbeiten-audit-filter 4.4, A4, A5, A7): Gruppe „Zeitraum“ mit den nativen
 * Datumsfeldern „Von“ und „Bis“. Eine Änderung wird erst mit vollständigem Datum gemeldet, ein geleertes Feld als „nicht
 * angegeben“. Die Regeln (Reihenfolge, 366 Tage) prüft nur die API; ihre Meldungen stehen am Feld.
 */
export function ZeitraumFilter({ wert, onWert, fehler, className }: ZeitraumFilterProps) {
  const hilfeId = useId()

  // Eingabe, die (noch) nicht gemeldet wird (Zwischenwerte beim Tippen des Jahres, außerhalb von min/max). Ändert der
  // Aufrufer den Wert eines Felds (Chip entfernt, Zurück-Schaltfläche, Zurücksetzen), wird der Entwurf verworfen.
  const [entwurf, setEntwurf] = useState<Zeitraum>({})
  const [vorher, setVorher] = useState<Zeitraum>(wert)
  if (wert.von !== vorher.von || wert.bis !== vorher.bis) {
    setVorher(wert)
    setEntwurf((alt) => ({
      von: wert.von === vorher.von ? alt.von : undefined,
      bis: wert.bis === vorher.bis ? alt.bis : undefined,
    }))
  }

  function anzeige(feld: keyof Zeitraum): string {
    return entwurf[feld] ?? wert[feld] ?? ''
  }

  function aendern(feld: keyof Zeitraum, text: string) {
    // Nur leere Felder und vollständige Daten im Bereich min–max melden (W2): Zwischenwerte wie 0202-10-01 lösen weder
    // Request noch Verlaufseintrag aus und bleiben nur als Entwurf im Feld.
    if (text !== '' && (!DATUM.test(text) || text < MIN || text > MAX)) {
      setEntwurf((alt) => ({ ...alt, [feld]: text }))
      return
    }
    setEntwurf((alt) => ({ ...alt, [feld]: undefined }))
    const neu = text === '' ? undefined : text
    if (neu === wert[feld]) return
    const ergebnis: Zeitraum = { ...wert }
    if (neu === undefined) delete ergebnis[feld]
    else ergebnis[feld] = neu
    onWert(ergebnis)
  }

  return (
    <FieldSet aria-describedby={hilfeId} className={cn('m-0 min-w-0 gap-2 border-0 p-0', className)}>
      <FieldLegend variant="label" className="mb-0">
        Zeitraum
      </FieldLegend>
      <FieldDescription id={hilfeId}>{HILFETEXT}</FieldDescription>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['von', 'bis'] as const).map((feld) => (
          <Formularfeld key={feld} label={feld === 'von' ? 'Von' : 'Bis'} fehler={fehler?.[feld]}>
            {(attribute) => (
              <Input
                {...attribute}
                type="date"
                min={MIN}
                max={MAX}
                value={anzeige(feld)}
                onChange={(ereignis) => aendern(feld, ereignis.target.value)}
                className="sm:w-44"
              />
            )}
          </Formularfeld>
        ))}
      </div>
    </FieldSet>
  )
}
