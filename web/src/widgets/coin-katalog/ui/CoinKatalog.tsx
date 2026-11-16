import { SearchIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CoinKarten, CoinListe, ladeCoins, type Coin } from '@/entities/coin'
import type { ApiErgebnis, Seite } from '@/shared/api'
import { SPEICHER_KATALOG_ANSICHT } from '@/shared/config'
import { useFokusBeiLadefehler, useLokaleWahl } from '@/shared/lib/hooks'
import { Ansichtsumschalter, type Ansicht } from '@/shared/ui/ansichtsumschalter'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { Button } from '@/shared/ui/button'
import { Filterleiste, type FilterChip } from '@/shared/ui/filterleiste'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shared/ui/input-group'
import { Label } from '@/shared/ui/label'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

const GROESSE = 25
const SUCHE_MAX_LAENGE = 100
const ANSICHTEN: ReadonlyArray<Ansicht> = ['tabelle', 'karten']
const LADEFEHLER = 'Coins konnten nicht geladen werden. Bitte später erneut versuchen.'

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
 * Katalog mit Filterleiste (Suche, Ansicht, Chip), Statuszeile, Tabelle oder Karten und Blättern (katalog-seiten AK-14
 * bis AK-16, startseite-listen-pruefung Abschnitt 4.2). Suche und Seite kommen als Props (sie stehen in der URL); eine
 * Antwort gilt nur, solange sie zu den aktuellen Props passt. Die Ansicht steht im localStorage (ADR-0044) und löst
 * keinen Request aus.
 */
export function CoinKatalog({ suche, seite, onSuche, onSeite }: CoinKatalogProps) {
  const [eingabe, setEingabe] = useState(suche)
  const [vorherigeSuche, setVorherigeSuche] = useState(suche)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  const [ansicht, setAnsicht] = useLokaleWahl<Ansicht>(SPEICHER_KATALOG_ANSICHT, ANSICHTEN, 'tabelle')
  // Zählt erneute Abrufe nach einem Ladefehler; bei gleicher URL lösen erst sie einen neuen Request aus.
  const [neuladen, setNeuladen] = useState(0)
  const sucheId = useId()
  const suchfeldRef = useRef<HTMLInputElement>(null)
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

  function erneutLaden() {
    anfrage.current = null
    setNeuladen((n) => n + 1)
  }

  function suchen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Nach einem Ladefehler lädt dieselbe Suche erneut, wenn sich die URL nicht ändert (gleicher Begriff, schon Seite 1).
    // Ändert sie sich, lädt die neue URL ohnehin; ein Zähler würde sonst die alte Seite noch einmal anfordern.
    if (fehlgeschlagen && eingabe.trim() === suche && seite === 1) erneutLaden()
    onSuche(eingabe)
  }

  /** Suche zurücksetzen (Chip oder Leerzustand): Feld leeren, URL ohne `suche`, Seite 1. */
  function sucheZuruecksetzen() {
    setEingabe('')
    onSuche('')
  }

  const chips: FilterChip[] =
    suche.trim() === '' ? [] : [{ id: 'suche', text: `Suche: ${suche}`, onEntfernen: sucheZuruecksetzen }]

  return (
    <div className="grid min-w-0 gap-4">
      <Filterleiste chips={chips}>
        <form
          role="search"
          onSubmit={suchen}
          className="flex min-w-0 flex-1 basis-full flex-wrap items-end gap-2 md:basis-auto"
        >
          <div className="grid min-w-0 flex-1 gap-2 md:max-w-reading">
            <Label htmlFor={sucheId}>Coins suchen</Label>
            <InputGroup className="h-12">
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                ref={suchfeldRef}
                id={sucheId}
                type="search"
                className="h-12 text-base md:text-base"
                maxLength={SUCHE_MAX_LAENGE}
                value={eingabe}
                onChange={(e) => setEingabe(e.target.value)}
              />
            </InputGroup>
          </div>
          <Button type="submit" variant="outline" size="lg">
            <SearchIcon aria-hidden="true" />
            Suchen
          </Button>
        </form>
        <Ansichtsumschalter wert={ansicht} onWert={setAnsicht} className="md:ml-auto" />
      </Filterleiste>

      <p role="status" className="text-sm text-muted-foreground empty:sr-only">
        {laedt && 'Coins werden geladen …'}
        {ergebnis?.art === 'ok' && trefferText(ergebnis.daten.gesamt)}
      </p>
      {fehlgeschlagen && (
        <Fehlerzustand ref={alarmRef} fokussierbar meldung={LADEFEHLER} onErneutVersuchen={erneutLaden} />
      )}

      {anzeige === null && laedt && (
        <Ladeanzeige text="Coins werden geladen …" ansage={false} form={ansicht === 'karten' ? 'karte' : 'tabelle'} />
      )}

      {anzeige?.art === 'ok' &&
        (anzeige.daten.gesamt === 0 ? (
          mitSuchbegriff ? (
            <Leerzustand
              titel="Keine Coins gefunden."
              beschreibung="Prüfen Sie die Schreibweise oder suchen Sie nach einem anderen Begriff."
              aktion={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    sucheZuruecksetzen()
                    suchfeldRef.current?.focus()
                  }}
                >
                  Suche zurücksetzen
                </Button>
              }
            />
          ) : (
            <Leerzustand titel="Noch keine Coins erfasst." />
          )
        ) : (
          <>
            {anzeige.daten.eintraege.length === 0 ? (
              <Leerzustand titel="Auf dieser Seite gibt es keine Coins." />
            ) : ansicht === 'karten' ? (
              <CoinKarten coins={anzeige.daten.eintraege} />
            ) : (
              <CoinListe coins={anzeige.daten.eintraege} />
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
