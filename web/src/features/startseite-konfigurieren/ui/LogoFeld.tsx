import { useEffect, useId, useRef, type ChangeEvent } from 'react'
import { LOGO_NAMEN, type LogoPlatz } from '@/entities/startseite'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import type { LogoEingabe } from '../model/formular'

export interface LogoFeldProps {
  platz: LogoPlatz
  eingabe: LogoEingabe
  /** Object-URL der ausgewählten Datei (Vorschau); `null` ohne Auswahl. */
  vorschauUrl: string | null
  /** Ids der Hinweise im Kopfbereich (Formate, Metadaten, Sichtbarkeit), per `aria-describedby` verknüpft. */
  hinweisIds: string
  dateiFehler?: string
  alttextFehler?: string
  onDatei: (datei: File | null) => void
  onEntfernen: () => void
  onAlternativtext: (text: string) => void
  /** Während des Speicherns sind alle Bedienelemente gesperrt. */
  gesperrt?: boolean
}

/**
 * Ein Logo-Platz (AK-27): aktuelle Vorschau, Dateifeld „Logo auswählen“, „Logo entfernen“ und Pflichtfeld
 * „Alternativtext“, sobald ein Logo vorhanden oder ausgewählt ist. Erlaubte Typen nur als Vorauswahl; geprüft wird
 * am Inhalt auf dem Server.
 */
export function LogoFeld({
  platz,
  eingabe,
  vorschauUrl,
  hinweisIds,
  dateiFehler,
  alttextFehler,
  onDatei,
  onEntfernen,
  onAlternativtext,
  gesperrt = false,
}: LogoFeldProps) {
  const basis = useId()
  const dateiRef = useRef<HTMLInputElement>(null)
  const dateiId = `${basis}-datei`
  const dateiFehlerId = `${basis}-datei-fehler`
  const altId = `${basis}-alt`
  const altFehlerId = `${basis}-alt-fehler`

  // Nach „Logo entfernen“, „Verwerfen“ oder dem Speichern zeigt das Dateifeld keine alte Auswahl mehr.
  useEffect(() => {
    if (!eingabe.datei && dateiRef.current) dateiRef.current.value = ''
  }, [eingabe.datei])

  const url = eingabe.datei ? vorschauUrl : (eingabe.vorhanden?.url ?? null)
  const alternativtext = eingabe.alternativtext.trim()

  function waehle(e: ChangeEvent<HTMLInputElement>) {
    onDatei(e.target.files?.[0] ?? null)
  }

  // Der Button verschwindet nach dem Entfernen; der Fokus geht auf das Dateifeld desselben Logos (AK-33).
  function entfernen() {
    onEntfernen()
    dateiRef.current?.focus()
  }

  return (
    <fieldset className="grid gap-3 rounded-lg border p-4">
      <legend className="px-1 font-medium">{LOGO_NAMEN[platz]}</legend>
      {url ? (
        <span className="inline-flex w-fit rounded-lg bg-white p-2">
          <img
            src={url}
            alt={alternativtext || 'Vorschau des ausgewählten Logos'}
            width={eingabe.datei ? undefined : eingabe.vorhanden?.breite}
            height={eingabe.datei ? undefined : eingabe.vorhanden?.hoehe}
            className="h-auto max-h-24 w-auto max-w-full object-contain"
          />
        </span>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={dateiId}>Logo auswählen</Label>
        <Input
          ref={dateiRef}
          id={dateiId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={waehle}
          disabled={gesperrt}
          aria-invalid={dateiFehler ? true : undefined}
          aria-describedby={[hinweisIds, dateiFehler ? dateiFehlerId : ''].filter(Boolean).join(' ') || undefined}
        />
        {dateiFehler ? (
          <p id={dateiFehlerId} className="text-sm text-destructive">
            {dateiFehler}
          </p>
        ) : null}
      </div>
      {eingabe.datei || eingabe.vorhanden ? (
        <div>
          <Button type="button" variant="outline" onClick={entfernen} disabled={gesperrt} focusableWhenDisabled>
            Logo entfernen
          </Button>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={altId}>Alternativtext</Label>
        <Input
          id={altId}
          type="text"
          value={eingabe.alternativtext}
          onChange={(e) => onAlternativtext(e.target.value)}
          disabled={gesperrt}
          aria-invalid={alttextFehler ? true : undefined}
          aria-describedby={alttextFehler ? altFehlerId : undefined}
        />
        {alttextFehler ? (
          <p id={altFehlerId} className="text-sm text-destructive">
            {alttextFehler}
          </p>
        ) : null}
      </div>
    </fieldset>
  )
}
