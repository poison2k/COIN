import { useEffect, useRef, useState } from 'react'
import { ladeCoins, type Coin } from '@/entities/coin'
import { Button } from '@/shared/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/shared/ui/combobox'

/** Verzögerung der Suche nach der letzten Eingabe (AK-29). */
const VERZOEGERUNG_MS = 300
/** Höchstens so viele Treffer je Suche (AK-29). */
const TREFFER_MAX = 20

function bezeichnung(coin: Coin): string {
  return `${coin.name} – ${coin.herausgeber}`
}

export interface CoinAuswahlProps {
  /** Id des Eingabefelds (für das Label). */
  id: string
  /** Gewählter Coin oder `null`. */
  wert: Coin | null
  onWert: (coin: Coin | null) => void
  /** Ids zusätzlicher Beschreibungen. */
  beschreibungId?: string
}

/**
 * Combobox „Coin (optional)“ (hologrammnummer AK-29, AK-33): Suche über GET /api/coins?suche=…&groesse=20, 300 ms
 * verzögert, Einträge „Name – Herausgeber“, „Keine Coins gefunden“ ohne Treffer. Pfeiltasten, Enter wählt, Escape
 * schließt; die Auswahl ist per Button „Auswahl entfernen“ löschbar. Die Hologrammnummer wird hier nie verwendet.
 */
export function CoinAuswahl({ id, wert, onWert, beschreibungId }: CoinAuswahlProps) {
  const [eingabe, setEingabe] = useState(wert ? bezeichnung(wert) : '')
  const [treffer, setTreffer] = useState<Coin[]>([])
  const [gesucht, setGesucht] = useState(false)
  const [suche, setSuche] = useState<string | null>(null)
  const eingabeRef = useRef<HTMLInputElement>(null)

  // Suche verzögert nach der letzten Eingabe; nur das Ergebnis der jüngsten Suche zählt.
  useEffect(() => {
    if (suche === null) return undefined
    const begriff = suche.trim()
    if (begriff === '') return undefined
    let aktiv = true
    const zeitgeber = setTimeout(() => {
      void ladeCoins({ suche: begriff, seite: 1, groesse: TREFFER_MAX }).then((ergebnis) => {
        if (!aktiv) return
        setTreffer(ergebnis.art === 'ok' ? ergebnis.daten.eintraege : [])
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
    // Das Übernehmen der Bezeichnung nach einer Auswahl ist keine neue Suche.
    if (wert && text === bezeichnung(wert)) return
    setGesucht(false)
    setTreffer([])
    setSuche(text)
  }

  function entfernen() {
    onWert(null)
    setEingabe('')
    setSuche(null)
    setTreffer([])
    setGesucht(false)
    eingabeRef.current?.focus()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Combobox<Coin>
        items={treffer}
        filter={null}
        value={wert}
        onValueChange={(coin) => onWert(coin ?? null)}
        inputValue={eingabe}
        onInputValueChange={eingabeGeaendert}
        itemToStringLabel={bezeichnung}
        itemToStringValue={(coin) => coin.id}
        isItemEqualToValue={(a, b) => a.id === b.id}
        inputRef={eingabeRef}
      >
        <ComboboxInput
          id={id}
          className="w-full min-w-0 flex-1 sm:w-96"
          autoComplete="off"
          aria-describedby={beschreibungId}
        />
        <ComboboxContent>
          <ComboboxEmpty>{gesucht ? 'Keine Coins gefunden' : null}</ComboboxEmpty>
          <ComboboxList>
            {(coin: Coin) => (
              <ComboboxItem key={coin.id} value={coin}>
                {bezeichnung(coin)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {wert && (
        <Button type="button" variant="outline" onClick={entfernen}>
          Auswahl entfernen
        </Button>
      )}
    </div>
  )
}
