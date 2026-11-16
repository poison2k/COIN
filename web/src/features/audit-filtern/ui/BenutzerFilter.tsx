import { useEffect, useRef, useState } from 'react'
import { ladeBenutzerliste } from '@/entities/benutzer'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/shared/ui/combobox'
import { Formularfeld } from '@/shared/ui/formularfeld'

/** Verzögerung der Suche nach der letzten Eingabe (startseite-listen-pruefung AK-29). */
const VERZOEGERUNG_MS = 300
/** Höchstens so viele Treffer je Suche (AK-29). */
const TREFFER_MAX = 20
const HILFETEXT = 'Zeigt Änderungen an diesem Benutzerkonto.'

/** Gewählter Benutzer: nur Id und Name, nie die E-Mail. */
export interface GefilterterBenutzer {
  id: string
  name: string
}

export interface BenutzerFilterProps {
  wert: GefilterterBenutzer | null
  onWert: (benutzer: GefilterterBenutzer | null) => void
  className?: string
}

/**
 * Benutzerfilter des Audit-Logs (startseite-listen-pruefung 4.4, F5 Variante A): Combobox „Benutzer“ für den geänderten
 * Benutzer. Suche über GET /api/benutzer?suche=…&groesse=20, 300 ms nach der letzten Eingabe; Treffer nur mit Namen.
 * Name und Id stehen nur im Zustand (nie in URL oder Storage).
 */
export function BenutzerFilter({ wert, onWert, className }: BenutzerFilterProps) {
  const [eingabe, setEingabe] = useState(wert?.name ?? '')
  const [vorherigerWert, setVorherigerWert] = useState(wert)
  const [treffer, setTreffer] = useState<GefilterterBenutzer[]>([])
  const [gesucht, setGesucht] = useState(false)
  // Die letzte Suche ist fehlgeschlagen: statt „Keine Benutzer gefunden“ ein Hinweis auf den Ladefehler.
  const [suchFehler, setSuchFehler] = useState(false)
  const [suche, setSuche] = useState<string | null>(null)
  const [offenGewuenscht, setOffenGewuenscht] = useState(false)
  const eingabeRef = useRef<HTMLInputElement>(null)

  // Ändert der Aufrufer die Wahl (z. B. Chip entfernt), zeigt das Feld den neuen Stand.
  if (wert !== vorherigerWert) {
    setVorherigerWert(wert)
    setEingabe(wert?.name ?? '')
    if (wert === null) {
      setSuche(null)
      setTreffer([])
      setGesucht(false)
    }
  }

  useEffect(() => {
    if (suche === null) return undefined
    const begriff = suche.trim()
    if (begriff === '') return undefined
    let aktiv = true
    const zeitgeber = setTimeout(() => {
      void ladeBenutzerliste({ suche: begriff, seite: 1, groesse: TREFFER_MAX }).then((ergebnis) => {
        if (!aktiv) return
        // Nur Id und Name übernehmen; E-Mail-Adressen erscheinen nie in der Auswahl.
        setTreffer(ergebnis.art === 'ok' ? ergebnis.daten.eintraege.map(({ id, name }) => ({ id, name })) : [])
        setSuchFehler(ergebnis.art !== 'ok')
        setGesucht(true)
      })
    }, VERZOEGERUNG_MS)
    return () => {
      aktiv = false
      clearTimeout(zeitgeber)
    }
  }, [suche])

  function eingabeGeaendert(text: string) {
    setEingabe(text)
    // Das Übernehmen des Namens nach einer Auswahl ist keine neue Suche.
    if (wert && text === wert.name) return
    setGesucht(false)
    setTreffer([])
    setSuche(text)
  }

  return (
    <Formularfeld label="Benutzer" hilfetext={HILFETEXT} className={className}>
      {(feld) => (
        <Combobox<GefilterterBenutzer>
          items={treffer}
          filter={null}
          value={wert}
          onValueChange={(benutzer) => onWert(benutzer ?? null)}
          inputValue={eingabe}
          onInputValueChange={eingabeGeaendert}
          itemToStringLabel={(benutzer) => benutzer.name}
          itemToStringValue={(benutzer) => benutzer.id}
          isItemEqualToValue={(a, b) => a.id === b.id}
          inputRef={eingabeRef}
          // Die Liste öffnet erst, wenn es etwas zu zeigen gibt (Treffer oder „Keine Benutzer gefunden“); eine leere Liste
          // würde nur den übrigen Inhalt für Screenreader ausblenden.
          open={offenGewuenscht && (treffer.length > 0 || gesucht)}
          onOpenChange={setOffenGewuenscht}
        >
          <ComboboxInput
            id={feld.id}
            aria-describedby={feld['aria-describedby']}
            className="w-full min-w-0 sm:w-80"
            autoComplete="off"
          />
          <ComboboxContent>
            {/* ComboboxEmpty ist eine Live-Region (role="status"); der Text wird vorgelesen. */}
            <ComboboxEmpty>
              {gesucht ? (suchFehler ? 'Benutzer konnten nicht geladen werden.' : 'Keine Benutzer gefunden') : null}
            </ComboboxEmpty>
            <ComboboxList>
              {(benutzer: GefilterterBenutzer) => (
                <ComboboxItem key={benutzer.id} value={benutzer}>
                  {benutzer.name}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
    </Formularfeld>
  )
}
