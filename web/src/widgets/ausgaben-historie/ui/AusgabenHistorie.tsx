import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { AusgabenTabelle, ladeAusgaben, type Ausgabe, type AusgabeStatus } from '@/entities/ausgabe'
import { AusgabeStornieren } from '@/features/ausgabe-stornieren'
import { ZertifikatHerunterladen } from '@/features/zertifikat-herunterladen'
import type { ApiErgebnis, Seite } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { Filterleiste } from '@/shared/ui/filterleiste'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Fehlerzustand, Leerzustand } from '@/shared/ui/zustaende'

type Filter = AusgabeStatus | 'alle'

const FILTER = [
  { value: 'alle', label: 'Alle' },
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'storniert', label: 'Storniert' },
] satisfies Array<{ value: Filter; label: string }>

const FILTER_TEXT: Readonly<Record<AusgabeStatus, string>> = { aktiv: 'Aktiv', storniert: 'Storniert' }

interface Geladen {
  schluessel: string
  ergebnis: ApiErgebnis<Seite<Ausgabe>>
}

export interface AusgabenHistorieProps {
  coinId: string
  /** Button „Stornieren“ je aktiver Ausgabe (issues.write). */
  darfStornieren: boolean
  /** Button „Zertifikat herunterladen“ je Ausgabe (issues.write, zertifikat-erzeugen AK-24). */
  darfZertifikat: boolean
  /** Nach einem Storno, damit die Kennzahlen neu laden. */
  onGeaendert: () => void
}

/**
 * Abschnitt „Ausgabehistorie“ der Detailseite (coin-ausgaben AK-22, AK-24): Statusfilter mit Chip (Server-Parameter
 * `status`, nicht in der URL; formulare-detailseiten F8), Tabelle bzw. Karten, Blättern (Seite lokal), Zeilenklick zur
 * Ausgabe-Seite und „Stornieren“ je aktiver Zeile. Nach einem Storno erscheint eine Statusmeldung mit Fokus; die Historie lädt neu.
 * Spalte „Zertifikat“ (zertifikat-erzeugen AK-24): Nummer als Link zur Ausgabe-Seite und, mit `darfZertifikat`, der
 * Download; nach 409 `ausgabe_storniert` lädt die Historie neu.
 */
export function AusgabenHistorie({ coinId, darfStornieren, darfZertifikat, onGeaendert }: AusgabenHistorieProps) {
  const [seite, setSeite] = useState(1)
  const [status, setStatus] = useState<AusgabeStatus | undefined>(undefined)
  const [neuLaden, setNeuLaden] = useState(0)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  // Ausgabe, deren Storno-Dialog nach einem Fehler offen ist: Er bleibt nach dem Neuladen stehen, auch wenn sie
  // inzwischen storniert ist (sonst verschwände die Fehlermeldung mit dem Dialog).
  const [offenNachFehler, setOffenNachFehler] = useState<string | null>(null)
  const meldungRef = useRef<HTMLParagraphElement>(null)
  const fokusAufMeldung = useRef(false)
  const anfrage = useRef<{ schluessel: string; ergebnis: Promise<ApiErgebnis<Seite<Ausgabe>>> } | null>(null)
  const basis = useId()
  const ueberschriftId = `${basis}-ueberschrift`
  const filterId = `${basis}-filter`

  const schluessel = JSON.stringify([coinId, status ?? null, seite, neuLaden])

  useEffect(() => {
    if (anfrage.current?.schluessel !== schluessel) {
      anfrage.current = { schluessel, ergebnis: ladeAusgaben(coinId, { status, seite }) }
    }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen({ schluessel, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [schluessel, coinId, status, seite])

  // Nach einem Storno die Statusmeldung fokussieren (der Button der Zeile entfällt).
  useEffect(() => {
    if (meldung && fokusAufMeldung.current) {
      fokusAufMeldung.current = false
      meldungRef.current?.focus()
    }
  }, [meldung])

  const ergebnis = geladen?.schluessel === schluessel ? geladen.ergebnis : null
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'
  const { bereichRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)
  const daten = anzeige?.art === 'ok' ? anzeige.daten : null

  function blaettern(neu: number) {
    merkeFokus()
    setSeite(neu)
  }

  function filtere(neu: AusgabeStatus | undefined) {
    setStatus(neu)
    setSeite(1)
  }

  function filterGewaehlt(wert: Filter | null) {
    filtere(wert === 'aktiv' || wert === 'storniert' ? wert : undefined)
  }

  function zertifikatLink(ausgabe: Ausgabe) {
    return (
      <Link
        to={ROUTEN.ausgabeDetail}
        params={{ coinId, ausgabeId: ausgabe.id }}
        data-zeilenlink=""
        aria-label={
          ausgabe.storno === null
            ? `Ausgabe ${ausgabe.zertifikatsnummer} anzeigen`
            : `Stornierte Ausgabe ${ausgabe.zertifikatsnummer} anzeigen`
        }
        className="inline-flex min-h-10 items-center rounded-sm font-mono tabular-nums underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring"
      >
        {ausgabe.zertifikatsnummer}
      </Link>
    )
  }

  function zertifikatDownload(ausgabe: Ausgabe) {
    return darfZertifikat ? (
      <ZertifikatHerunterladen
        coinId={coinId}
        ausgabe={ausgabe}
        variante="zeile"
        onStorniertErkannt={() => setNeuLaden((n) => n + 1)}
      />
    ) : null
  }

  function storniert(ausgabe: Ausgabe) {
    setOffenNachFehler(null)
    fokusAufMeldung.current = true
    setMeldung(`Ausgabe von Exemplar Nr. ${ausgabe.exemplarNummer} wurde storniert.`)
    setNeuLaden((n) => n + 1)
    onGeaendert()
  }

  function stornoFehlgeschlagen(ausgabeId: string) {
    // Z. B. 409 bereits_storniert: Die Historie zeigt danach den aktuellen Stand.
    setOffenNachFehler(ausgabeId)
    setNeuLaden((n) => n + 1)
  }

  return (
    <section aria-labelledby={ueberschriftId} className="grid min-w-0 gap-4">
      <h2 id={ueberschriftId} className="text-lg font-semibold">
        Ausgabehistorie
      </h2>

      <p
        ref={meldungRef}
        role="status"
        tabIndex={-1}
        className="rounded-md text-sm outline-none empty:sr-only focus-visible:ring-3 focus-visible:ring-ring"
      >
        {meldung ?? (laedt && daten === null ? 'Ausgaben werden geladen …' : '')}
      </p>
      {fehlgeschlagen && (
        <Fehlerzustand
          ref={alarmRef}
          fokussierbar
          meldung="Die Ausgaben konnten nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={() => setNeuLaden((n) => n + 1)}
        />
      )}

      {daten && (daten.gesamt > 0 || status !== undefined) && (
        <Filterleiste
          chips={
            status
              ? [{ id: 'status', text: `Status: ${FILTER_TEXT[status]}`, onEntfernen: () => filtere(undefined) }]
              : []
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor={filterId}>Status</Label>
            <Select<Filter> items={FILTER} value={status ?? 'alle'} onValueChange={filterGewaehlt}>
              <SelectTrigger id={filterId} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER.map((eintrag) => (
                  <SelectItem key={eintrag.value} value={eintrag.value}>
                    {eintrag.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Filterleiste>
      )}

      {daten &&
        (daten.gesamt === 0 ? (
          <Leerzustand
            titelEbene={3}
            titel={
              status === undefined
                ? 'Für diesen Coin wurden noch keine Ausgaben erfasst.'
                : 'Keine Ausgaben mit diesem Status.'
            }
          />
        ) : (
          <>
            {daten.eintraege.length > 0 ? (
              <AusgabenTabelle
                ausgaben={daten.eintraege}
                zeilenklick
                kartenTitel={zertifikatLink}
                zertifikatKarte={darfZertifikat ? zertifikatDownload : undefined}
                zertifikat={(ausgabe) => (
                  <div className="grid justify-items-start gap-2">
                    {zertifikatLink(ausgabe)}
                    {zertifikatDownload(ausgabe)}
                  </div>
                )}
                aktion={
                  darfStornieren
                    ? (ausgabe) =>
                        ausgabe.storno === null || ausgabe.id === offenNachFehler ? (
                          <AusgabeStornieren
                            coinId={coinId}
                            ausgabe={ausgabe}
                            onStorniert={storniert}
                            onFehler={() => stornoFehlgeschlagen(ausgabe.id)}
                            onGeschlossen={() => setOffenNachFehler(null)}
                          />
                        ) : null
                    : undefined
                }
              />
            ) : (
              <Leerzustand titelEbene={3} titel="Auf dieser Seite gibt es keine Ausgaben." />
            )}
            <div ref={bereichRef}>
              <Blaettern
                seite={daten.seite}
                seiten={seitenAnzahl(daten.gesamt, daten.groesse)}
                onSeite={blaettern}
                laedt={laedt}
              />
            </div>
          </>
        ))}
    </section>
  )
}
