import { useEffect, useMemo, useRef, useState } from 'react'
import { AuditTabelle, ladeAuditAktionen, ladeAuditLog, type AuditAktion, type AuditEintrag } from '@/entities/audit'
import {
  AktionFilter,
  BenutzerFilter,
  hatFilter,
  LEERE_ABFRAGE,
  ZeitraumFilter,
  type AuditAbfrage,
  type GefilterterBenutzer,
  type Zeitraum,
} from '@/features/audit-filtern'
import type { ApiErgebnis, Seite } from '@/shared/api'
import { formatiereKalenderdatum } from '@/shared/lib/format'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { Button } from '@/shared/ui/button'
import { Filterleiste, type FilterChip } from '@/shared/ui/filterleiste'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

const GROESSE = 25
const LADETEXT = 'Änderungsprotokoll wird geladen …'
const ZURUECKSETZEN = 'Filter zurücksetzen'
const UNBEKANNT = 'unbekannt'

export interface AuditLogProps {
  /** Abfrage aus der URL (Route); ohne Angabe hält das Widget die Abfrage selbst. */
  abfrage?: AuditAbfrage
  /** Neue Abfrage (Filteränderung, Zurücksetzen, Blättern); die Route schreibt sie in die URL. */
  onAbfrage?: (abfrage: AuditAbfrage) => void
}

interface Geladen {
  schluessel: string
  abfrage: AuditAbfrage
  ergebnis: ApiErgebnis<Seite<AuditEintrag>>
}

type Aktionsliste = { art: 'laedt' } | { art: 'ok'; aktionen: AuditAktion[] } | { art: 'fehler' }

/** Stabiler Schlüssel einer Abfrage samt Zähler für „Erneut versuchen“. */
function schluesselVon(abfrage: AuditAbfrage, neuladen: number): string {
  return JSON.stringify([abfrage.von, abfrage.bis, abfrage.aktionen, abfrage.benutzerId, abfrage.seite, neuladen])
}

function abfrageAusSchluessel(schluessel: string): AuditAbfrage {
  const [von, bis, aktionen, benutzerId, seite] = JSON.parse(schluessel) as [
    string | undefined,
    string | undefined,
    string[],
    string | undefined,
    number,
  ]
  return { von: von ?? undefined, bis: bis ?? undefined, aktionen, benutzerId: benutzerId ?? undefined, seite }
}

/**
 * Tab „Änderungsprotokoll“ (rollen-benutzerverwaltung AK-31, startseite-listen-pruefung 4.4, nacharbeiten-audit-filter
 * 4.4): Filter nach Zeitraum, Aktion (Liste aus der API) und Benutzer mit Chips, Tabelle, Blättern und die Zustände
 * Laden, Fehler mit „Erneut versuchen“, Feldfehler (400) und leer mit bzw. ohne Filter. Mit `abfrage`/`onAbfrage`
 * steuert die Route die Abfrage (URL), sonst das Widget selbst. In der URL steht nie der Name des Benutzers.
 */
export function AuditLog({ abfrage: vorgegeben, onAbfrage }: AuditLogProps) {
  const [eigene, setEigene] = useState<AuditAbfrage>(LEERE_ABFRAGE)
  const abfrage = vorgegeben ?? eigene
  const [neuladen, setNeuladen] = useState(0)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  const [aktionsliste, setAktionsliste] = useState<Aktionsliste>({ art: 'laedt' })
  // Name aus der Wahl in der Combobox; nach Neuladen oder geteilten Links aus den geladenen Einträgen (F1).
  const [gewaehlt, setGewaehlt] = useState<GefilterterBenutzer | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const fokusNachZuruecksetzen = useRef(false)
  // Zählt „Filter zurücksetzen“; als `key` des Zeitraumfilters verwirft er auch nicht gemeldete Zwischenwerte (R2-G1).
  const [zurueckgesetzt, setZurueckgesetzt] = useState(0)

  const schluessel = schluesselVon(abfrage, neuladen)

  useEffect(() => {
    let aktiv = true
    const aktuell = abfrageAusSchluessel(schluessel)
    void ladeAuditLog({
      von: aktuell.von,
      bis: aktuell.bis,
      aktionen: aktuell.aktionen,
      benutzerId: aktuell.benutzerId,
      seite: aktuell.seite,
      groesse: GROESSE,
    }).then((ergebnis) => {
      if (aktiv) setGeladen({ schluessel, abfrage: aktuell, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [schluessel])

  useEffect(() => {
    let aktiv = true
    void ladeAuditAktionen().then((ergebnis) => {
      if (!aktiv) return
      setAktionsliste(ergebnis.art === 'ok' ? { art: 'ok', aktionen: ergebnis.daten } : { art: 'fehler' })
    })
    return () => {
      aktiv = false
    }
  }, [])

  const filterAktiv = hatFilter(abfrage)
  useEffect(() => {
    if (!fokusNachZuruecksetzen.current || filterAktiv) return
    fokusNachZuruecksetzen.current = false
    filterRef.current?.querySelector<HTMLElement>('input:not([type="hidden"])')?.focus()
  }, [filterAktiv])

  const ergebnis = geladen?.schluessel === schluessel ? geladen.ergebnis : null
  // Beim Nachladen bleibt die vorige Seite stehen, bis die Antwort da ist (Tabelle und Blättern nicht aushängen).
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const feldfehler = ergebnis?.art === 'validierung' ? ergebnis.fehler : null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok' && feldfehler === null
  const angezeigteAbfrage = anzeige === ergebnis ? abfrage : (geladen?.abfrage ?? abfrage)
  // Ein Ladefehler hängt das Blättern aus; lag der Fokus darin, wandert er auf den Alarm statt auf body (WCAG 2.4.3).
  const { bereichRef: blaetternRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)

  const aktionen = aktionsliste.art === 'ok' ? aktionsliste.aktionen : []
  const benutzerName = useMemo(() => {
    if (!abfrage.benutzerId) return null
    if (gewaehlt?.id === abfrage.benutzerId) return gewaehlt.name
    const daten = geladen?.abfrage.benutzerId === abfrage.benutzerId && geladen.ergebnis.art === 'ok' ? geladen : null
    if (!daten || daten.ergebnis.art !== 'ok') return null
    return daten.ergebnis.daten.eintraege.find((e) => e.benutzer.id === abfrage.benutzerId)?.benutzer.name ?? UNBEKANNT
  }, [abfrage.benutzerId, gewaehlt, geladen])
  const benutzerWert = useMemo<GefilterterBenutzer | null>(
    () =>
      abfrage.benutzerId && benutzerName && benutzerName !== UNBEKANNT
        ? { id: abfrage.benutzerId, name: benutzerName }
        : null,
    [abfrage.benutzerId, benutzerName],
  )

  function setzen(neu: AuditAbfrage) {
    if (onAbfrage) onAbfrage(neu)
    else setEigene(neu)
  }

  function filtern(teil: Partial<AuditAbfrage>) {
    setzen({ ...abfrage, ...teil, seite: 1 })
  }

  function blaettern(neu: number) {
    merkeFokus()
    setzen({ ...abfrage, seite: neu })
  }

  function zeitraumGeaendert(zeitraum: Zeitraum) {
    filtern({ von: zeitraum.von, bis: zeitraum.bis })
  }

  function benutzerGewaehlt(benutzer: GefilterterBenutzer | null) {
    setGewaehlt(benutzer)
    filtern({ benutzerId: benutzer?.id })
  }

  function zuruecksetzen() {
    setGewaehlt(null)
    setZurueckgesetzt((n) => n + 1)
    setzen(LEERE_ABFRAGE)
  }

  function zuruecksetzenMitFokus() {
    fokusNachZuruecksetzen.current = true
    zuruecksetzen()
  }

  const reihenfolge = (wert: string) => {
    const index = aktionen.findIndex((a) => a.wert === wert)
    return index < 0 ? aktionen.length : index
  }
  const gewaehlteAktionen = [...abfrage.aktionen].sort((a, b) => reihenfolge(a) - reihenfolge(b))

  const chips: FilterChip[] = [
    ...(abfrage.von
      ? [
          {
            id: 'von',
            text: `Von: ${formatiereKalenderdatum(abfrage.von)}`,
            onEntfernen: () => filtern({ von: undefined }),
          },
        ]
      : []),
    ...(abfrage.bis
      ? [
          {
            id: 'bis',
            text: `Bis: ${formatiereKalenderdatum(abfrage.bis)}`,
            onEntfernen: () => filtern({ bis: undefined }),
          },
        ]
      : []),
    ...gewaehlteAktionen.map((wert) => ({
      id: `aktion-${wert}`,
      text: `Aktion: ${aktionen.find((a) => a.wert === wert)?.bezeichnung ?? wert}`,
      onEntfernen: () => filtern({ aktionen: abfrage.aktionen.filter((a) => a !== wert) }),
    })),
    ...(abfrage.benutzerId
      ? [
          {
            id: 'benutzer',
            text: `Benutzer: ${benutzerName ?? UNBEKANNT}`,
            onEntfernen: () => benutzerGewaehlt(null),
          },
        ]
      : []),
  ]

  const ersterFehler = (feld: string) => feldfehler?.[feld]?.[0]

  return (
    <div data-inhaltsbereich="" className="grid min-w-0 gap-4">
      <div ref={filterRef}>
        <Filterleiste
          chips={chips}
          onAlleEntfernen={zuruecksetzen}
          alleEntfernenText={ZURUECKSETZEN}
          alleEntfernenAb={1}
        >
          <div className="grid w-full min-w-0 gap-4 md:grid-cols-[auto_auto] md:items-start lg:grid-cols-[auto_auto_1fr]">
            <ZeitraumFilter
              key={zurueckgesetzt}
              wert={{ von: abfrage.von, bis: abfrage.bis }}
              onWert={zeitraumGeaendert}
              fehler={{ von: ersterFehler('von'), bis: ersterFehler('bis') }}
            />
            <AktionFilter
              aktionen={aktionen}
              wert={abfrage.aktionen}
              onWert={(werte) => filtern({ aktionen: werte })}
              fehler={ersterFehler('aktion')}
              ladefehler={aktionsliste.art === 'fehler'}
            />
            <BenutzerFilter
              wert={benutzerWert}
              onWert={benutzerGewaehlt}
              fehler={ersterFehler('benutzerId')}
              className="w-full max-w-reading md:col-span-2 lg:col-span-1"
            />
          </div>
        </Filterleiste>
      </div>

      {laedt && anzeige === null && <Ladeanzeige text={LADETEXT} form="tabelle" />}
      {laedt && anzeige !== null && (
        <p role="status" className="text-sm text-muted-foreground">
          {LADETEXT}
        </p>
      )}
      {fehlgeschlagen && (
        <Fehlerzustand
          ref={alarmRef}
          fokussierbar
          meldung="Änderungsprotokoll konnte nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={() => setNeuladen((n) => n + 1)}
        />
      )}
      {feldfehler === null &&
        anzeige?.art === 'ok' &&
        anzeige.daten.gesamt === 0 &&
        (hatFilter(angezeigteAbfrage) ? (
          <Leerzustand
            titelEbene={3}
            titel="Keine Einträge für diese Filter."
            aktion={
              <Button type="button" variant="outline" onClick={zuruecksetzenMitFokus}>
                {ZURUECKSETZEN}
              </Button>
            }
          />
        ) : (
          <Leerzustand titelEbene={3} titel="Noch keine Einträge." />
        ))}
      {feldfehler === null && anzeige?.art === 'ok' && anzeige.daten.gesamt > 0 && (
        <>
          {anzeige.daten.eintraege.length === 0 ? (
            // Seite hinter dem Ende (z. B. seite=99 aus der URL): Blättern bleibt, damit man zurückfindet.
            <Leerzustand titelEbene={3} titel="Auf dieser Seite gibt es keine Einträge." />
          ) : (
            <AuditTabelle eintraege={anzeige.daten.eintraege} />
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
      )}
    </div>
  )
}
