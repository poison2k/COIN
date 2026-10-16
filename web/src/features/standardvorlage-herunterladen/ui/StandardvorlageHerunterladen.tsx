import { DownloadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { dateinameAusAntwort, ladeStandardvorlage } from '@/entities/zertifikatsvorlage'
import { speichereDatei } from '@/shared/lib/datei'
import { Button } from '@/shared/ui/button'

const TEXT_FEHLER = 'Die Vorlage konnte nicht heruntergeladen werden. Bitte später erneut versuchen.'

/**
 * Button „Standardvorlage herunterladen“ (zertifikatsvorlagen, AK-30/AK-31): lädt per `fetch` mit Token und speichert
 * die Datei; währenddessen gesperrt, Fehler als Alarm. Sendet nichts außer dem Download-Request.
 */
export function StandardvorlageHerunterladen() {
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState(false)
  // Synchroner Schutz gegen Doppelklicks vor dem nächsten Rendern.
  const laedtGerade = useRef(false)

  async function herunterladen() {
    if (laedtGerade.current) return
    laedtGerade.current = true
    setLaedt(true)
    setFehler(false)
    try {
      const ergebnis = await ladeStandardvorlage()
      if (ergebnis.art === 'ok') speichereDatei(ergebnis.daten.blob, dateinameAusAntwort(ergebnis.daten.dateiname))
      else setFehler(true)
    } finally {
      laedtGerade.current = false
      setLaedt(false)
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button type="button" variant="outline" onClick={() => void herunterladen()} disabled={laedt}>
        <DownloadIcon aria-hidden="true" />
        Standardvorlage herunterladen
      </Button>
      {fehler && (
        <p role="alert" className="text-sm text-destructive">
          {TEXT_FEHLER}
        </p>
      )}
    </div>
  )
}
