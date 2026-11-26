import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import type { Coin } from '@/entities/coin'
import { ExemplarTabelle, Kennzahlen, type ExemplarStatus } from '@/entities/exemplar'
import { AuflageAendern } from '@/features/auflage-aendern'
import { ROUTEN } from '@/shared/config'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { buttonVariants } from '@/shared/ui/button'
import { Filterleiste } from '@/shared/ui/filterleiste'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Fehlerzustand, Leerzustand } from '@/shared/ui/zustaende'
import { useExemplare, type ExemplareDaten } from '../model/use-exemplare'

type Filter = ExemplarStatus | 'alle'

const FILTER = [
  { value: 'alle', label: 'Alle' },
  { value: 'verfuegbar', label: 'Verfügbar' },
  { value: 'ausgegeben', label: 'Ausgegeben' },
] satisfies Array<{ value: Filter; label: string }>

const FILTER_TEXT: Readonly<Record<ExemplarStatus, string>> = { verfuegbar: 'Verfügbar', ausgegeben: 'Ausgegeben' }

export interface CoinExemplareProps {
  coinId: string
  /** Filter aus der URL; ohne Angabe alle. */
  status?: ExemplarStatus
  /** Seite aus der URL, beginnend bei 1. */
  seite: number
  /** Zähler von außen: Jede Änderung lädt neu (z. B. nach einem Storno in der Historie). */
  neuLaden: number
  /** Link „Ausgabe erfassen“ zeigen (issues.write). */
  darfErfassen: boolean
  /** „Auflage ändern“ zeigen (coins.write). */
  darfAuflageAendern: boolean
  /** Neuer Filter; `undefined` = „Alle“. Die Route beginnt damit wieder auf Seite 1. */
  onStatus: (status?: ExemplarStatus) => void
  onSeite: (seite: number) => void
  /** Nach dem Ändern der Auflage mit dem geänderten Coin (Stammdaten aktualisieren). */
  onAuflageGeaendert?: (coin: Coin) => void
  /**
   * Daten von außen (kontrolliert, formulare-detailseiten ADR-0042 Punkt 4): Die Detailseite lädt …/exemplare selbst und
   * teilt die Antwort mit den Kennzahlen im Kopf; dann lädt das Widget nicht.
   */
  daten?: ExemplareDaten
  /** Kennzahlen im Abschnitt zeigen (Standard `true`); die Detailseite zeigt sie im Kopf. */
  kennzahlenZeigen?: boolean
  /** „Erneut versuchen“ bei Daten von außen (der Aufrufer lädt neu); sonst lädt das Widget selbst neu. */
  onErneutVersuchen?: () => void
}

/**
 * Abschnitt „Exemplare“ der Detailseite (coin-ausgaben AK-20, AK-23, AK-25): Kennzahlen, Status-Filter mit Chip
 * (formulare-detailseiten AK-24), Tabelle bzw. Karten und Blättern. Filter und Seite kommen als Props (URL); eine
 * Antwort gilt nur, solange sie zu den Props passt.
 */
export function CoinExemplare({
  coinId,
  status,
  seite,
  neuLaden,
  darfErfassen,
  darfAuflageAendern,
  onStatus,
  onSeite,
  onAuflageGeaendert,
  daten: datenVonAussen,
  kennzahlenZeigen = true,
  onErneutVersuchen,
}: CoinExemplareProps) {
  // Eigener Zähler für „Auflage geändert“; zusammen mit `neuLaden` Teil des Schlüssels.
  const [eigenesNeuLaden, setEigenesNeuLaden] = useState(0)
  const [meldung, setMeldung] = useState<string | null>(null)
  const basis = useId()
  const ueberschriftId = `${basis}-ueberschrift`
  const filterId = `${basis}-filter`

  const eigene = useExemplare({
    coinId,
    status,
    seite,
    neuLaden: `${neuLaden}-${eigenesNeuLaden}`,
    aktiv: datenVonAussen === undefined,
  })
  const { ergebnis, anzeige } = datenVonAussen ?? eigene
  const laedt = ergebnis === null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'
  const { bereichRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)

  const daten = anzeige?.art === 'ok' ? anzeige.daten : null
  const auflageBekannt = daten !== null && daten.kennzahlen.auflage !== null

  function blaettern(neu: number) {
    merkeFokus()
    onSeite(neu)
  }

  function filterGewaehlt(wert: Filter | null) {
    onStatus(wert === 'verfuegbar' || wert === 'ausgegeben' ? wert : undefined)
  }

  function auflageGeaendert(coin: Coin) {
    setMeldung('Auflage wurde geändert.')
    setEigenesNeuLaden((n) => n + 1)
    onAuflageGeaendert?.(coin)
  }

  return (
    <section data-inhaltsbereich="" aria-labelledby={ueberschriftId} className="grid min-w-0 gap-4">
      <h2 id={ueberschriftId} className="text-lg font-semibold">
        Exemplare
      </h2>

      <p role="status" className="text-sm text-muted-foreground empty:sr-only">
        {laedt ? 'Exemplare werden geladen …' : (meldung ?? '')}
      </p>
      {fehlgeschlagen && (
        <Fehlerzustand
          ref={alarmRef}
          fokussierbar
          meldung="Die Exemplare konnten nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={datenVonAussen === undefined ? () => setEigenesNeuLaden((n) => n + 1) : onErneutVersuchen}
        />
      )}

      {daten && (kennzahlenZeigen || darfAuflageAendern || darfErfassen) && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          {kennzahlenZeigen && <Kennzahlen kennzahlen={daten.kennzahlen} />}
          {(darfAuflageAendern || (darfErfassen && auflageBekannt)) && (
            <div className="flex flex-wrap gap-2">
              {darfAuflageAendern && (
                <AuflageAendern coinId={coinId} auflage={daten.kennzahlen.auflage} onGeaendert={auflageGeaendert} />
              )}
              {darfErfassen && auflageBekannt && (
                <Link to={ROUTEN.coinAusgabeNeu} params={{ coinId }} className={buttonVariants({ size: 'sm' })}>
                  Ausgabe erfassen
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {daten &&
        (!auflageBekannt ? (
          <Leerzustand
            titelEbene={3}
            titel="Für diesen Coin ist keine Auflage erfasst. Es gibt daher keine Exemplare."
          />
        ) : (
          <>
            <Filterleiste
              chips={
                status
                  ? [{ id: 'status', text: `Status: ${FILTER_TEXT[status]}`, onEntfernen: () => onStatus(undefined) }]
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
            {daten.gesamt === 0 ? (
              <Leerzustand titelEbene={3} titel="Keine Exemplare mit diesem Status." />
            ) : (
              <>
                {daten.eintraege.length > 0 ? (
                  <ExemplarTabelle exemplare={daten.eintraege} />
                ) : (
                  <Leerzustand titelEbene={3} titel="Auf dieser Seite gibt es keine Exemplare." />
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
            )}
          </>
        ))}
    </section>
  )
}
