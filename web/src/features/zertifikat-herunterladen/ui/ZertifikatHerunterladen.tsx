import { DownloadIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { Ausgabe } from '@/entities/ausgabe'
import type { ApiErgebnis, Datei } from '@/shared/api'
import { speichereDatei } from '@/shared/lib/datei'
import { cn } from '@/shared/lib/cn'
import { Aktionsmeldung } from '@/shared/ui/aktionsmeldung'
import { Button } from '@/shared/ui/button'
import { ladeZertifikat } from '../api/ladeZertifikat'
import { zertifikatDateiname } from '../model/zertifikatDateiname'

const TEXT_STORNIERT =
  'Diese Ausgabe wurde inzwischen storniert. Ein Zertifikat kann nicht mehr heruntergeladen werden.'
const TEXT_FEHLER = 'Das Zertifikat konnte nicht heruntergeladen werden. Bitte später erneut versuchen.'
const TEXT_HINWEIS_STORNIERT = 'Für stornierte Ausgaben kann kein Zertifikat heruntergeladen werden.'

/** Alarmtext zu einem Fehler (AK-26); nur feste Texte oder das `detail` des Servers ohne Personendaten. */
function fehlertext(ergebnis: Exclude<ApiErgebnis<Datei>, { art: 'ok' }>): string {
  switch (ergebnis.art) {
    case 'konflikt':
      if (ergebnis.code === 'ausgabe_storniert') return TEXT_STORNIERT
      if (ergebnis.code === 'vorlage_zu_viele_platzhalter' && ergebnis.detail) return ergebnis.detail
      return TEXT_FEHLER
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, Zertifikate herunterzuladen.'
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen. Bitte melden Sie sich erneut an.'
    default:
      return TEXT_FEHLER
  }
}

export interface ZertifikatHerunterladenProps {
  coinId: string
  ausgabe: Ausgabe
  /** „zeile“ in der Historie, „seite“ auf der Ausgabe-Seite (mit sichtbarem Hinweis bei Storno, AK-28). */
  variante: 'zeile' | 'seite'
  /** Nach 409 `ausgabe_storniert`, damit der Aufrufer neu lädt (AK-26). */
  onStorniertErkannt?: () => void
}

/**
 * Button „Zertifikat herunterladen“ (zertifikat-erzeugen, AK-24 bis AK-26, AK-28): lädt per `fetch` mit Token und
 * speichert die Datei; während des Downloads gesperrt, aber fokussierbar, damit der Fokus auf dem Button bleibt. Bei
 * stornierten Ausgaben vorhanden, aber ebenso fokussierbar gesperrt. Der zugängliche Name nennt Nummer und Status, weil eine Nummer nach
 * einem Storno zweimal in der Historie stehen kann. Fehler als Alarm beim Button.
 */
export function ZertifikatHerunterladen({
  coinId,
  ausgabe,
  variante,
  onStorniertErkannt,
}: ZertifikatHerunterladenProps) {
  const [laedt, setLaedt] = useState(false)
  const [alarm, setAlarm] = useState<string | null>(null)
  // Synchroner Schutz gegen Doppelklicks vor dem nächsten Rendern.
  const laedtGerade = useRef(false)
  const hinweisId = `${useId()}-hinweis`
  const storniert = ausgabe.storno !== null
  const nummer = ausgabe.zertifikatsnummer
  const name = storniert
    ? `Zertifikat herunterladen: ${nummer} (nicht möglich, Ausgabe storniert)`
    : `Zertifikat herunterladen: ${nummer}`
  const mitHinweis = storniert && variante === 'seite'

  async function herunterladen() {
    if (storniert || laedtGerade.current) return
    laedtGerade.current = true
    setLaedt(true)
    setAlarm(null)
    try {
      const ergebnis = await ladeZertifikat(coinId, ausgabe.id)
      if (ergebnis.art === 'ok') {
        speichereDatei(ergebnis.daten.blob, zertifikatDateiname(ergebnis.daten.dateiname, nummer))
        return
      }
      setAlarm(fehlertext(ergebnis))
      if (ergebnis.art === 'konflikt' && ergebnis.code === 'ausgabe_storniert') onStorniertErkannt?.()
    } finally {
      laedtGerade.current = false
      setLaedt(false)
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button
        type="button"
        variant="outline"
        size={variante === 'zeile' ? 'sm' : 'default'}
        // In Tabellenzeilen darf die Beschriftung umbrechen, damit die Historie ohne Querscrollen passt (AK-29).
        className={cn(
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          variante === 'zeile' && 'h-auto min-h-10 py-1.5 text-left whitespace-normal',
        )}
        aria-label={name}
        aria-describedby={mitHinweis ? hinweisId : undefined}
        disabled={storniert || laedt}
        // Gesperrt per aria-disabled statt disabled (Download läuft oder Ausgabe storniert): Der Button bleibt fokussierbar,
        // damit der Fokus nach 409 und Neuladen nicht auf <body> fällt (AK-26, AK-30). Klicks bleiben wirkungslos.
        focusableWhenDisabled
        onClick={() => void herunterladen()}
      >
        <DownloadIcon aria-hidden="true" />
        Zertifikat herunterladen
      </Button>
      {mitHinweis && (
        <p id={hinweisId} className="text-sm text-muted-foreground">
          {TEXT_HINWEIS_STORNIERT}
        </p>
      )}
      <Aktionsmeldung meldung={alarm ? { art: 'fehler', text: alarm } : null} className="whitespace-normal" />
    </div>
  )
}
