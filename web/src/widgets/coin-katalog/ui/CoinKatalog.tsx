import { SearchIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CoinListe, ladeCoins, type Coin } from '@/entities/coin'
import type { ApiErgebnis, Seite } from '@/shared/api'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

const GROESSE = 25
const SUCHE_MAX_LAENGE = 100

interface Geladen {
  suche: string
  seite: number
  neuladen: number
  ergebnis: ApiErgebnis<Seite<Coin>>
}

export interface CoinKatalogProps {
  /** Suchbegriff aus der URL (leer = alle). */
  suche: string
  /** Seite aus der URL, beginnend bei 1. */
  seite: number
  /** Neue Suche abgeschickt; die Route beginnt damit wieder auf Seite 1. */
  onSuche: (suche: string) => void
  onSeite: (seite: number) => void
}

function trefferText(gesamt: number): string {
  return gesamt === 1 ? '1 Coin gefunden' : `${gesamt} Coins gefunden`
}

/**
 * Katalog mit Suche, Statuszeile, Tabelle und Blättern (katalog-seiten, AK-14 bis AK-16). Suche und Seite kommen als
 * Props (sie stehen in der URL); eine Antwort gilt nur, solange sie zu den aktuellen Props passt.
 */
export function CoinKatalog({ suche, seite, onSuche, onSeite }: CoinKatalogProps) {
  const [eingabe, setEingabe] = useState(suche)
  const [vorherigeSuche, setVorherigeSuche] = useState(suche)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  // Zählt erneute Suchen nach einem Ladefehler; bei gleicher URL lösen erst sie einen neuen Request aus.
  const [neuladen, setNeuladen] = useState(0)
  const sucheId = useId()
  // Laufende Anfrage je Suche und Seite wiederverwenden (z. B. im StrictMode), damit es genau einen Request gibt.
  const anfrage = useRef<{ schluessel: string; ergebnis: Promise<ApiErgebnis<Seite<Coin>>> } | null>(null)

  // Ändert sich die Suche von außen (z. B. „Zurück“ im Browser), zeigt das Feld den neuen Wert.
  if (suche !== vorherigeSuche) {
    setVorherigeSuche(suche)
    setEingabe(suche)
  }

  useEffect(() => {
    const schluessel = JSON.stringify([suche, seite, neuladen])
    if (anfrage.current?.schluessel !== schluessel) {
      anfrage.current = { schluessel, ergebnis: ladeCoins({ suche, seite, groesse: GROESSE }) }
    }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen({ suche, seite, neuladen, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [suche, seite, neuladen])

  const aktuell = geladen?.suche === suche && geladen.seite === seite && geladen.neuladen === neuladen
  const ergebnis = aktuell ? geladen.ergebnis : null
  // Beim Nachladen bleibt die vorige Seite stehen, bis die Antwort da ist (Tabelle und Blättern nicht aushängen).
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const mitSuchbegriff = (anzeige === ergebnis ? suche : (geladen?.suche ?? '')).trim() !== ''
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'

  // Ein Ladefehler hängt das Blättern aus; lag der Fokus darin, wandert er auf den Alarm statt auf body.
  const { bereichRef: blaetternRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)

  function blaettern(neu: number) {
    merkeFokus()
    onSeite(neu)
  }

  function suchen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Nach einem Ladefehler lädt dieselbe Suche erneut, wenn sich die URL nicht ändert (gleicher Begriff, schon Seite 1).
    // Ändert sie sich, lädt die neue URL ohnehin; ein Zähler würde sonst die alte Seite noch einmal anfordern.
    if (fehlgeschlagen && eingabe.trim() === suche && seite === 1) {
      anfrage.current = null
      setNeuladen((n) => n + 1)
    }
    onSuche(eingabe)
  }

  return (
    <div className="grid min-w-0 gap-4">
      <form role="search" onSubmit={suchen} className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={sucheId}>Coins suchen</Label>
          <Input
            id={sucheId}
            type="search"
            className="w-64 max-w-full"
            maxLength={SUCHE_MAX_LAENGE}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          <SearchIcon aria-hidden="true" />
          Suchen
        </Button>
      </form>

      <p role="status" className="text-sm text-muted-foreground">
        {laedt && 'Coins werden geladen …'}
        {ergebnis?.art === 'ok' && trefferText(ergebnis.daten.gesamt)}
      </p>
      {fehlgeschlagen && (
        <p
          ref={alarmRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Coins konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {anzeige?.art === 'ok' &&
        (anzeige.daten.gesamt === 0 ? (
          <p className="text-muted-foreground">
            {mitSuchbegriff ? 'Keine Coins gefunden.' : 'Noch keine Coins erfasst.'}
          </p>
        ) : (
          <>
            {anzeige.daten.eintraege.length > 0 ? (
              <CoinListe coins={anzeige.daten.eintraege} />
            ) : (
              <p className="text-muted-foreground">Auf dieser Seite gibt es keine Coins.</p>
            )}
            <div ref={blaetternRef}>
              <Blaettern
                seite={anzeige.daten.seite}
                seiten={seitenAnzahl(anzeige.daten.gesamt, anzeige.daten.groesse)}
                onSeite={blaettern}
                laedt={laedt}
              />
            </div>
          </>
        ))}
    </div>
  )
}
