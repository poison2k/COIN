import { DownloadIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  dateinameAusAntwort,
  ladeAktuelleVorlage,
  ladeVorlagenStatus,
  ladeVorlagenVersion,
  VersionenTabelle,
  type VorlagenStatus,
} from '@/entities/zertifikatsvorlage'
import { StandardvorlageHerunterladen } from '@/features/standardvorlage-herunterladen'
import { VorlageHochladen } from '@/features/vorlage-hochladen'
import { VorlageZuruecksetzen } from '@/features/vorlage-zuruecksetzen'
import type { ApiErgebnis, Datei } from '@/shared/api'
import { speichereDatei } from '@/shared/lib/datei'
import { Button } from '@/shared/ui/button'

const TEXT_DOWNLOAD_FEHLER = 'Die Vorlage konnte nicht heruntergeladen werden. Bitte später erneut versuchen.'
const TEXT_LADEFEHLER = 'Die Zertifikatsvorlage konnte nicht geladen werden. Bitte später erneut versuchen.'

interface DownloadKnopfProps {
  laden: () => Promise<ApiErgebnis<Datei>>
  /** Dateiname zur Antwort: Name aus dem Header nach Muster, sonst der Name aus dem bekannten Stand (AK-30). */
  dateiname: (ausHeader: string | null) => string
  onFehler: () => void
  onStart: () => void
  'aria-label'?: string
  size?: 'default' | 'sm'
  children: ReactNode
}

/** Download per `fetch` mit Token; der Button ist währenddessen gesperrt (AK-30). */
function DownloadKnopf({ laden, dateiname: name, onFehler, onStart, size, children, ...rest }: DownloadKnopfProps) {
  const [laedt, setLaedt] = useState(false)
  const laedtGerade = useRef(false)

  async function herunterladen() {
    if (laedtGerade.current) return
    laedtGerade.current = true
    setLaedt(true)
    onStart()
    try {
      const ergebnis = await laden()
      if (ergebnis.art === 'ok') speichereDatei(ergebnis.daten.blob, name(ergebnis.daten.dateiname))
      else onFehler()
    } finally {
      laedtGerade.current = false
      setLaedt(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={() => void herunterladen()}
      disabled={laedt}
      aria-label={rest['aria-label']}
    >
      {children}
    </Button>
  )
}

interface Meldung {
  coinId: string
  text: string
  /** Fokus auf die Meldung setzen (nach dem Zurücksetzen, weil der Button verschwindet). */
  fokus: boolean
}

export interface ZertifikatsvorlageVerwaltenProps {
  coinId: string
}

/**
 * Abschnitt „Zertifikatsvorlage“ auf „Coin bearbeiten“ (zertifikatsvorlagen, AK-30): Status als Text, Downloads,
 * Versionstabelle, Upload und – nur mit eigener aktiver Vorlage – Zurücksetzen. Antworten zu einem anderen Coin werden
 * verworfen.
 */
export function ZertifikatsvorlageVerwalten({ coinId }: ZertifikatsvorlageVerwaltenProps) {
  const [geladen, setGeladen] = useState<{ coinId: string; ergebnis: ApiErgebnis<VorlagenStatus> } | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [downloadFehler, setDownloadFehler] = useState<string | null>(null)
  const meldungRef = useRef<HTMLParagraphElement>(null)
  const ueberschriftId = useId()

  useEffect(() => {
    let aktiv = true
    void ladeVorlagenStatus(coinId).then((ergebnis) => {
      if (aktiv) setGeladen({ coinId, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [coinId])

  useEffect(() => {
    if (meldung?.fokus) meldungRef.current?.focus()
  }, [meldung])

  const ergebnis = geladen?.coinId === coinId ? geladen.ergebnis : null
  const status = ergebnis?.art === 'ok' ? ergebnis.daten : null
  const aktuelleMeldung = meldung?.coinId === coinId ? meldung : null

  const uebernehmen = useCallback(
    (neu: VorlagenStatus) => setGeladen({ coinId, ergebnis: { art: 'ok', daten: neu } }),
    [coinId],
  )

  function hochgeladen(neu: VorlagenStatus) {
    uebernehmen(neu)
    setMeldung({ coinId, text: `Version ${neu.aktiveVersion} wurde hochgeladen und ist jetzt aktiv.`, fokus: false })
  }

  function zurueckgesetzt(neu: VorlagenStatus) {
    uebernehmen(neu)
    setMeldung({ coinId, text: 'Die Standardvorlage ist jetzt aktiv.', fokus: true })
  }

  // Neuer Upload: keine veraltete Meldung neben dem neuen Ergebnis (Rev. 3).
  function uploadBeginnt() {
    setMeldung(null)
    setDownloadFehler(null)
  }

  const downloadFehlerMelden = () => setDownloadFehler(TEXT_DOWNLOAD_FEHLER)
  const downloadStart = () => setDownloadFehler(null)

  return (
    <section aria-labelledby={ueberschriftId} className="grid gap-4">
      <h2 id={ueberschriftId} className="text-lg font-semibold">
        Zertifikatsvorlage
      </h2>

      {ergebnis === null && <p role="status">Zertifikatsvorlage wird geladen …</p>}
      {ergebnis !== null && status === null && (
        <p role="alert" className="text-destructive">
          {TEXT_LADEFEHLER}
        </p>
      )}

      {status && (
        <>
          <p>
            {status.aktiveVersion === null
              ? 'Aktiv: Standardvorlage'
              : `Aktiv: eigene Vorlage, Version ${status.aktiveVersion}`}
          </p>

          {aktuelleMeldung && (
            <p ref={meldungRef} role="status" tabIndex={-1} className="text-success outline-none">
              {aktuelleMeldung.text}
            </p>
          )}

          <div className="flex flex-wrap items-start gap-2">
            <DownloadKnopf
              laden={() => ladeAktuelleVorlage(coinId)}
              dateiname={(ausHeader) => dateinameAusAntwort(ausHeader, coinId, status.aktiveVersion)}
              onFehler={downloadFehlerMelden}
              onStart={downloadStart}
            >
              <DownloadIcon aria-hidden="true" />
              Aktuelle Vorlage herunterladen
            </DownloadKnopf>
            <StandardvorlageHerunterladen />
            {status.aktiveVersion !== null && (
              <VorlageZuruecksetzen coinId={coinId} onZurueckgesetzt={zurueckgesetzt} />
            )}
          </div>

          {downloadFehler && (
            <p role="alert" className="text-sm text-destructive">
              {downloadFehler}
            </p>
          )}

          {status.versionen.length === 0 ? (
            <p className="text-muted-foreground">Es wurde noch keine eigene Vorlage hochgeladen.</p>
          ) : (
            <VersionenTabelle
              versionen={status.versionen}
              aktion={(version) => (
                <DownloadKnopf
                  laden={() => ladeVorlagenVersion(coinId, version.version)}
                  dateiname={(ausHeader) => dateinameAusAntwort(ausHeader, coinId, version.version)}
                  onFehler={downloadFehlerMelden}
                  onStart={downloadStart}
                  size="sm"
                  aria-label={`Version ${version.version} herunterladen`}
                >
                  Herunterladen
                </DownloadKnopf>
              )}
            />
          )}

          <VorlageHochladen coinId={coinId} onHochgeladen={hochgeladen} onUploadBeginnt={uploadBeginnt} />
        </>
      )}
    </section>
  )
}
