import { SearchIcon } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { ladeBenutzerliste, ROLLEN_ANZEIGE, StatusBadge, type BenutzerEintrag, type Seite } from '@/entities/benutzer'
import { StatusAendern } from '@/features/benutzer-status-aendern'
import { RolleZuweisen } from '@/features/rolle-zuweisen'
import type { ApiErgebnis } from '@/shared/api'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { Button } from '@/shared/ui/button'
import { DatenTabelle, type DatenSpalte } from '@/shared/ui/daten-tabelle'
import { Filterleiste } from '@/shared/ui/filterleiste'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'

const GROESSE = 25
const HINWEIS_EIGENES_KONTO = 'Das eigene Konto kann nicht geändert werden.'
const HINWEIS_SUCHE = 'Sucht in Name und E-Mail.'

interface Anfrage {
  suche: string
  seite: number
}

interface Geladen {
  anfrage: Anfrage
  ergebnis: ApiErgebnis<Seite<BenutzerEintrag>>
}

type Meldung = { art: 'erfolg' | 'fehler'; text: string }

export interface BenutzerTabelleProps {
  /** Id des angemeldeten Benutzers (aus /api/me); seine Zeile ist gesperrt (AK-29). */
  aktuellerBenutzerId: string
}

/**
 * Tab „Benutzer“ der Benutzerverwaltung (AK-26 bis AK-30): Suche (mit Chip „Suche: {Wert}“, formulare-detailseiten
 * AK-33), Tabelle bzw. Karten unter 768 px mit fester Sortierung „Name“ aufsteigend, Blättern und Meldungen. Rolle und Status
 * ändern die Features; Fehler daraus erscheinen als Alarm an der Tabelle, die Zeile zeigt danach den Serverstand.
 */
export function BenutzerTabelle({ aktuellerBenutzerId }: BenutzerTabelleProps) {
  const [eingabe, setEingabe] = useState('')
  const [anfrage, setAnfrage] = useState<Anfrage>({ suche: '', seite: 1 })
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const hinweisId = useId()

  useEffect(() => {
    let aktiv = true
    void ladeBenutzerliste({ suche: anfrage.suche, seite: anfrage.seite, groesse: GROESSE }).then((ergebnis) => {
      if (aktiv) setGeladen({ anfrage, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [anfrage])

  const ergebnis = geladen?.anfrage === anfrage ? geladen.ergebnis : null
  // Beim Nachladen bleibt die vorige Seite stehen, bis die Antwort da ist (Tabelle und Blättern nicht aushängen).
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'
  // Ein Ladefehler hängt das Blättern aus; lag der Fokus darin, wandert er auf den Alarm statt auf body (WCAG 2.4.3).
  const { bereichRef: blaetternRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)

  function suchen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMeldung(null)
    setAnfrage({ suche: eingabe, seite: 1 })
  }

  function sucheEntfernen() {
    setMeldung(null)
    setEingabe('')
    setAnfrage({ suche: '', seite: 1 })
  }

  function blaettern(seite: number) {
    merkeFokus()
    setMeldung(null)
    setAnfrage((alt) => ({ ...alt, seite }))
  }

  function ersetzen(neu: BenutzerEintrag) {
    setGeladen((alt) => {
      if (alt?.ergebnis.art !== 'ok') return alt
      const eintraege = alt.ergebnis.daten.eintraege.map((b) => (b.id === neu.id ? neu : b))
      return { ...alt, ergebnis: { art: 'ok', daten: { ...alt.ergebnis.daten, eintraege } } }
    })
  }

  function rolleGeaendert(neu: BenutzerEintrag) {
    ersetzen(neu)
    setMeldung({ art: 'erfolg', text: `Die Rolle von ${neu.name} wurde auf ${ROLLEN_ANZEIGE[neu.rolle]} geändert.` })
  }

  function statusGeaendert(neu: BenutzerEintrag) {
    ersetzen(neu)
    setMeldung({
      art: 'erfolg',
      text: neu.aktiv ? `${neu.name} wurde reaktiviert.` : `${neu.name} wurde deaktiviert.`,
    })
  }

  function fehler(text: string) {
    setMeldung({ art: 'fehler', text })
  }

  const spalten: ReadonlyArray<DatenSpalte<BenutzerEintrag>> = [
    {
      id: 'name',
      titel: 'Name',
      breite: 'breit',
      karte: 'titel',
      zelle: (benutzer) => (
        <span className="font-medium">
          {benutzer.name}
          {benutzer.id === aktuellerBenutzerId && <span className="font-normal text-muted-foreground"> (Sie)</span>}
        </span>
      ),
      kartenZelle: (benutzer) => benutzer.name,
    },
    { id: 'email', titel: 'E-Mail', breite: 'breit', karte: 'feld', zelle: (benutzer) => benutzer.email ?? '–' },
    {
      id: 'rolle',
      titel: 'Rolle',
      breite: 'mittel',
      karte: 'feld',
      zelle: (benutzer) => {
        const eigen = benutzer.id === aktuellerBenutzerId
        return (
          <RolleZuweisen
            benutzer={benutzer}
            deaktiviert={eigen}
            beschreibungId={eigen ? hinweisId : undefined}
            onGeaendert={rolleGeaendert}
            onFehler={fehler}
          />
        )
      },
    },
    {
      id: 'status',
      titel: 'Status',
      breite: 'schmal',
      karte: 'feld',
      zelle: (benutzer) => <StatusBadge aktiv={benutzer.aktiv} />,
    },
    {
      id: 'aktion',
      titel: 'Aktion',
      breite: 'schmal',
      karte: 'aktion',
      zelle: (benutzer) => {
        const eigen = benutzer.id === aktuellerBenutzerId
        return (
          <StatusAendern
            benutzer={benutzer}
            deaktiviert={eigen}
            beschreibungId={eigen ? hinweisId : undefined}
            onGeaendert={statusGeaendert}
            onFehler={fehler}
          />
        )
      },
    },
  ]

  return (
    <div className="grid min-w-0 gap-4">
      <Filterleiste
        chips={
          anfrage.suche.trim() === ''
            ? []
            : [{ id: 'suche', text: `Suche: ${anfrage.suche.trim()}`, onEntfernen: sucheEntfernen }]
        }
      >
        <form onSubmit={suchen} className="w-full max-w-reading">
          <Formularfeld label="Benutzer suchen" hilfetext={HINWEIS_SUCHE}>
            {(feld) => (
              <div className="flex flex-wrap gap-2">
                <Input
                  {...feld}
                  type="search"
                  className="w-64 max-w-full"
                  value={eingabe}
                  onChange={(e) => setEingabe(e.target.value)}
                />
                <Button type="submit" variant="outline">
                  <SearchIcon aria-hidden="true" />
                  Suchen
                </Button>
              </div>
            )}
          </Formularfeld>
        </form>
      </Filterleiste>

      <p role="status" className="text-sm text-muted-foreground">
        {laedt && 'Benutzer werden geladen …'}
        {ergebnis?.art === 'ok' && `${ergebnis.daten.gesamt} Benutzer gefunden`}
      </p>
      {fehlgeschlagen && (
        <p
          ref={alarmRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          Benutzer konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {meldung?.art === 'erfolg' && (
        <p role="status" className="text-success">
          {meldung.text}
        </p>
      )}
      {meldung?.art === 'fehler' && (
        <p role="alert" className="text-destructive">
          {meldung.text}
        </p>
      )}

      {anzeige?.art === 'ok' && (
        <>
          <span id={hinweisId} className="sr-only">
            {HINWEIS_EIGENES_KONTO}
          </span>
          <DatenTabelle
            beschriftung="Benutzer"
            zeilen={anzeige.daten.eintraege}
            schluessel={(benutzer) => benutzer.id}
            spalten={spalten}
            sortierung={{ spalte: 'name', richtung: 'aufsteigend' }}
            kartenUnter="md"
          />
          <div ref={blaetternRef}>
            <Blaettern
              seite={anzeige.daten.seite}
              seiten={seitenAnzahl(anzeige.daten.gesamt, anzeige.daten.groesse)}
              onSeite={blaettern}
              laedt={laedt}
            />
          </div>
        </>
      )}
    </div>
  )
}
