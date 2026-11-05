import { Link } from '@tanstack/react-router'
import { BanIcon, CircleCheckIcon, SearchXIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ROUTEN } from '@/shared/config'
import { cn } from '@/shared/lib/cn'
import { formatiereKalenderdatum, formatiereZahl } from '@/shared/lib/format'
import type { PruefDatensatz, PruefErgebnis, PruefErgebnisArt } from '../model/types'

interface Darstellung {
  ueberschrift: string
  icon: LucideIcon
  /** Text- und Rahmenfarbe aus den Theme-Tokens (Kontrast Text ≥ 4,5:1, Icon/Rahmen ≥ 3:1). */
  farbe: string
}

/** Überschrift, Icon und Farbe je Ergebnis (AK-30): nie nur über die Farbe unterscheidbar. */
const DARSTELLUNG: Record<PruefErgebnisArt, Darstellung> = {
  gueltig: { ueberschrift: 'Zertifikat gültig', icon: CircleCheckIcon, farbe: 'text-success border-success' },
  storniert: {
    ueberschrift: 'Ausgabe storniert, Zertifikat ungültig',
    icon: BanIcon,
    farbe: 'text-destructive border-destructive',
  },
  falscherCoin: {
    ueberschrift: 'Die Nummer gehört nicht zu diesem Coin.',
    icon: TriangleAlertIcon,
    farbe: 'text-warning border-warning',
  },
  nichtGefunden: {
    ueberschrift: 'Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.',
    icon: SearchXIcon,
    farbe: 'text-muted-foreground border-muted-foreground',
  },
}

const LINK =
  'rounded-sm underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50'

function Eintrag({ begriff, children }: { begriff: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="font-medium text-muted-foreground">{begriff}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** Datensatz als Beschreibungsliste (AK-31); Empfängerangaben nur, wenn die Antwort sie enthält (…/mit-empfaenger). */
function Datensatz({ datensatz, mitEmpfaenger }: { datensatz: PruefDatensatz; mitEmpfaenger: boolean }) {
  const { empfaenger } = datensatz
  return (
    <dl className="grid gap-3">
      <Eintrag begriff="Coin">
        <Link to={ROUTEN.coinDetail} params={{ coinId: datensatz.coin.id }} className={LINK}>
          {datensatz.coin.name}
        </Link>
      </Eintrag>
      <Eintrag begriff="Exemplar">{`Nr. ${formatiereZahl(datensatz.exemplarNummer)}`}</Eintrag>
      <Eintrag begriff="Zertifikatsnummer">
        <span className="font-mono tabular-nums">{datensatz.zertifikatsnummer}</span>
      </Eintrag>
      <Eintrag begriff="Hologrammnummer">
        <span className="font-mono">{datensatz.hologrammnummer}</span>
      </Eintrag>
      <Eintrag begriff="Ausgabedatum">
        <time dateTime={datensatz.datum}>{formatiereKalenderdatum(datensatz.datum)}</time>
      </Eintrag>
      <Eintrag begriff="Status">
        {datensatz.status === 'storniert' && datensatz.storniertAm ? (
          <>
            Storniert am <time dateTime={datensatz.storniertAm}>{formatiereKalenderdatum(datensatz.storniertAm)}</time>
          </>
        ) : datensatz.status === 'storniert' ? (
          'Storniert'
        ) : (
          'Aktiv'
        )}
      </Eintrag>
      {mitEmpfaenger && empfaenger && (
        <Eintrag begriff="Empfänger">
          <span className="block">{empfaenger.name}</span>
          {empfaenger.dienstgrad !== null && <span className="block">{empfaenger.dienstgrad}</span>}
          {empfaenger.dienststelle !== null && <span className="block">{empfaenger.dienststelle}</span>}
        </Eintrag>
      )}
      {mitEmpfaenger && datensatz.gelegenheit !== undefined && (
        <Eintrag begriff="Gelegenheit">{datensatz.gelegenheit}</Eintrag>
      )}
      {mitEmpfaenger && datensatz.begruendung !== undefined && (
        <Eintrag begriff="Begründung">
          <span className="whitespace-pre-line">{datensatz.begruendung}</span>
        </Eintrag>
      )}
      {mitEmpfaenger && datensatz.ausgebendeStelle !== undefined && (
        <Eintrag begriff="Ausgebende Stelle">{datensatz.ausgebendeStelle}</Eintrag>
      )}
    </dl>
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
 * Ergebnis einer Prüfung (hologrammnummer AK-30, AK-31): h2 mit Icon (aria-hidden), Farbe und Text, „Geprüfte Nummer“,
 * bei gültig/storniert der Datensatz und mit Empfängerdaten der Link „Zur Ausgabe“. Nie ein Storno-Grund. Die
 * Live-Region liegt beim Aufrufer, damit sie dauerhaft vorhanden ist.
 */
export function PruefErgebnisAnzeige({ ergebnis, gepruefteNummer, mitEmpfaenger }: PruefErgebnisAnzeigeProps) {
  const darstellung = DARSTELLUNG[ergebnis.ergebnis]
  const Icon = darstellung.icon
  const datensatz = ergebnis.ergebnis === 'gueltig' || ergebnis.ergebnis === 'storniert' ? ergebnis.datensatz : null
  return (
    <div className={cn('grid gap-4 rounded-lg border-l-4 py-2 pl-4', darstellung.farbe)}>
      <div className="grid gap-1">
        <h2 className="flex items-start gap-2 text-lg font-semibold">
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{darstellung.ueberschrift}</span>
        </h2>
        <p className="text-sm break-words text-foreground">{`Geprüfte Nummer: ${gepruefteNummer}`}</p>
      </div>
      {datensatz && (
        <div className="grid gap-4 text-foreground">
          <Datensatz datensatz={datensatz} mitEmpfaenger={mitEmpfaenger} />
          {mitEmpfaenger && datensatz.ausgabeId && (
            <Link
              to={ROUTEN.ausgabeDetail}
              params={{ coinId: datensatz.coin.id, ausgabeId: datensatz.ausgabeId }}
              className={cn(LINK, 'justify-self-start')}
            >
              Zur Ausgabe
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
