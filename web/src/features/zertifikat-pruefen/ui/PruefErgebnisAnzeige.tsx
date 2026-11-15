import { Link } from '@tanstack/react-router'
import { BanIcon, CircleCheckIcon, SearchXIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ROUTEN } from '@/shared/config'
import { cn } from '@/shared/lib/cn'
import { formatiereKalenderdatum, formatiereZahl } from '@/shared/lib/format'
import { buttonVariants } from '@/shared/ui/button'
import { Ergebniskarte, type ErgebnisTon } from '@/shared/ui/ergebniskarte'
import type { PruefDatensatz, PruefErgebnis, PruefErgebnisArt } from '../model/types'

interface Darstellung {
  ueberschrift: string
  icon: LucideIcon
  ton: ErgebnisTon
}

/**
 * Überschrift, Icon und Ton je Ergebnis (hologrammnummer AK-30, startseite-listen-pruefung 4.3): Text und Icon sind je
 * Ergebnis verschieden, die Farbe kommt nur hinzu.
 */
const DARSTELLUNG: Record<PruefErgebnisArt, Darstellung> = {
  gueltig: { ueberschrift: 'Zertifikat gültig', icon: CircleCheckIcon, ton: 'erfolg' },
  storniert: { ueberschrift: 'Ausgabe storniert, Zertifikat ungültig', icon: BanIcon, ton: 'gefahr' },
  falscherCoin: { ueberschrift: 'Die Nummer gehört nicht zu diesem Coin.', icon: TriangleAlertIcon, ton: 'warnung' },
  nichtGefunden: {
    ueberschrift: 'Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.',
    icon: SearchXIcon,
    ton: 'neutral',
  },
}

const LINK =
  'inline-flex min-h-10 items-center rounded-sm underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring'

function Eintrag({ begriff, children }: { begriff: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm font-medium text-muted-foreground">{begriff}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** Gruppe des Datensatzes: h3 und eigene Beschreibungsliste (AK-25). */
function Gruppe({ titel, className, children }: { titel: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <h3 className="text-base font-semibold">{titel}</h3>
      <dl className="grid gap-3">{children}</dl>
    </div>
  )
}

/**
 * Datensatz in Gruppen (AK-25) mit unveränderten Begriffen, Werten und Reihenfolge. Empfängerangaben nur, wenn die
 * Prüfung über …/mit-empfaenger lief und die Antwort sie enthält. Ein Storno-Grund wird nie gelesen.
 */
function Datensatz({ datensatz, mitEmpfaenger }: { datensatz: PruefDatensatz; mitEmpfaenger: boolean }) {
  const { empfaenger } = datensatz
  const zeigeEmpfaenger =
    mitEmpfaenger &&
    (empfaenger !== undefined ||
      datensatz.gelegenheit !== undefined ||
      datensatz.begruendung !== undefined ||
      datensatz.ausgebendeStelle !== undefined)
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Gruppe titel="Coin und Exemplar">
        <Eintrag begriff="Coin">
          <Link to={ROUTEN.coinDetail} params={{ coinId: datensatz.coin.id }} className={LINK}>
            {datensatz.coin.name}
          </Link>
        </Eintrag>
        <Eintrag begriff="Exemplar">{`Nr. ${formatiereZahl(datensatz.exemplarNummer)}`}</Eintrag>
      </Gruppe>
      <Gruppe titel="Zertifikat">
        <Eintrag begriff="Zertifikatsnummer">
          <span className="font-mono tabular-nums">{datensatz.zertifikatsnummer}</span>
        </Eintrag>
        <Eintrag begriff="Hologrammnummer">
          <span className="font-mono">{datensatz.hologrammnummer}</span>
        </Eintrag>
      </Gruppe>
      <Gruppe titel="Ausgabe">
        <Eintrag begriff="Ausgabedatum">
          <time dateTime={datensatz.datum}>{formatiereKalenderdatum(datensatz.datum)}</time>
        </Eintrag>
        <Eintrag begriff="Status">
          {datensatz.status === 'storniert' && datensatz.storniertAm ? (
            <>
              Storniert am{' '}
              <time dateTime={datensatz.storniertAm}>{formatiereKalenderdatum(datensatz.storniertAm)}</time>
            </>
          ) : datensatz.status === 'storniert' ? (
            'Storniert'
          ) : (
            'Aktiv'
          )}
        </Eintrag>
      </Gruppe>
      {zeigeEmpfaenger && (
        <Gruppe titel="Empfängerdaten" className="sm:col-span-2">
          {empfaenger && (
            <Eintrag begriff="Empfänger">
              <span className="block">{empfaenger.name}</span>
              {empfaenger.dienstgrad !== null && <span className="block">{empfaenger.dienstgrad}</span>}
              {empfaenger.dienststelle !== null && <span className="block">{empfaenger.dienststelle}</span>}
            </Eintrag>
          )}
          {datensatz.gelegenheit !== undefined && <Eintrag begriff="Gelegenheit">{datensatz.gelegenheit}</Eintrag>}
          {datensatz.begruendung !== undefined && (
            <Eintrag begriff="Begründung">
              <span className="whitespace-pre-line">{datensatz.begruendung}</span>
            </Eintrag>
          )}
          {datensatz.ausgebendeStelle !== undefined && (
            <Eintrag begriff="Ausgebende Stelle">{datensatz.ausgebendeStelle}</Eintrag>
          )}
        </Gruppe>
      )}
    </div>
  )
}

export interface PruefErgebnisAnzeigeProps {
  ergebnis: PruefErgebnis
  /** Bereinigte Eingabe (Anzeigeform), die geprüft wurde. */
  gepruefteNummer: string
  /** Die Prüfung lief über …/mit-empfaenger (issues.read). */
  mitEmpfaenger: boolean
}

/**
 * Ergebnis einer Prüfung als Ergebniskarte (hologrammnummer AK-30/31, startseite-listen-pruefung AK-23 bis AK-26): h2 mit
 * Icon (aria-hidden) und Statusfarbe, „Geprüfte Nummer“, bei gültig/storniert der Datensatz in Gruppen und mit
 * Empfängerdaten der Link „Zur Ausgabe“. Nie ein Storno-Grund. Die Live-Region liegt beim Aufrufer.
 */
export function PruefErgebnisAnzeige({ ergebnis, gepruefteNummer, mitEmpfaenger }: PruefErgebnisAnzeigeProps) {
  const darstellung = DARSTELLUNG[ergebnis.ergebnis]
  const datensatz = ergebnis.ergebnis === 'gueltig' || ergebnis.ergebnis === 'storniert' ? ergebnis.datensatz : null
  return (
    <Ergebniskarte
      ton={darstellung.ton}
      icon={darstellung.icon}
      titel={darstellung.ueberschrift}
      kopfzusatz={<p className="break-words">{`Geprüfte Nummer: ${gepruefteNummer}`}</p>}
    >
      {datensatz && (
        <div className="grid gap-6">
          <Datensatz datensatz={datensatz} mitEmpfaenger={mitEmpfaenger} />
          {mitEmpfaenger && datensatz.ausgabeId && (
            <Link
              to={ROUTEN.ausgabeDetail}
              params={{ coinId: datensatz.coin.id, ausgabeId: datensatz.ausgabeId }}
              className={cn(buttonVariants({ variant: 'outline' }), 'justify-self-start')}
            >
              Zur Ausgabe
            </Link>
          )}
        </div>
      )}
    </Ergebniskarte>
  )
}
