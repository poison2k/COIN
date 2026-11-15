import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { useMedienabfrage, useZeilenklick } from '@/shared/lib/hooks'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

// Datentabelle (formulare-detailseiten, Abschnitt 4.7, ADR-0041): shadcn `table` mit Spaltendefinitionen. Unterhalb von
// `kartenUnter` (md = 768 px, lg = 1024 px; Standard lg bei mehr als fünf Spalten) eine Liste mit je einer Karte statt
// der Tabelle – immer nur eine Darstellung im DOM. Sortierbar per Button im Spaltenkopf nur mit `onSortierung` (vollständig
// geladene Listen, clientseitig); sonst zeigt `sortierung` die feste Serversortierung nur per `aria-sort`.

export type SortierRichtung = 'aufsteigend' | 'absteigend'

export interface Sortierung {
  spalte: string
  richtung: SortierRichtung
}

export interface DatenSpalte<T> {
  id: string
  titel: string
  zelle: (zeile: T) => ReactNode
  /** schmal: so schmal wie der Inhalt; mittel: ohne Umbruch; breit/rest: Freitext mit Umbruch. */
  breite: 'schmal' | 'mittel' | 'breit' | 'rest'
  ausrichtung?: 'links' | 'rechts'
  /** Rolle in der Kartenansicht. */
  karte: 'titel' | 'feld' | 'aktion' | 'aus'
  /** Spaltentitel nur für Screenreader (z. B. „Aktionen“). */
  titelVersteckt?: boolean
  /** Inhalt in der Karte, falls abweichend (z. B. der Link als Titel). */
  kartenZelle?: (zeile: T) => ReactNode
  /** Wert für die clientseitige Sortierung; ohne Angabe ist die Spalte nicht sortierbar. */
  sortierwert?: (zeile: T) => string | number
}

export interface DatenTabelleProps<T> {
  /** Caption (sr-only) bzw. Name der Kartenliste. */
  beschriftung: string
  zeilen: ReadonlyArray<T>
  schluessel: (zeile: T) => string
  spalten: ReadonlyArray<DatenSpalte<T>>
  sortierung?: Sortierung
  onSortierung?: (sortierung: Sortierung) => void
  /** Mausklick in die Zeile löst ihren Link aus (`data-zeilenlink`, sonst der erste Link). */
  zeilenklick?: boolean
  kartenUnter?: 'md' | 'lg'
  /** Darstellung erzwingen (z. B. auf der Bausteinseite); Standard per Media-Query. */
  ansicht?: 'automatisch' | 'karten' | 'tabelle'
  leer?: ReactNode
  className?: string
}

const KARTEN_QUERY = { md: '(max-width: 767px)', lg: '(max-width: 1023px)' } as const

const BREITE: Readonly<Record<DatenSpalte<unknown>['breite'], string>> = {
  schmal: 'w-px whitespace-nowrap',
  mittel: 'whitespace-normal',
  // Silbentrennung (lang="de") vor Notumbrüchen, damit Freitexte auch neben der Seitenleiste lesbar umbrechen.
  breit: 'whitespace-normal hyphens-auto wrap-anywhere',
  rest: 'w-full whitespace-normal hyphens-auto wrap-anywhere',
}

function vergleiche(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'de')
}

function sortiere<T>(
  zeilen: ReadonlyArray<T>,
  spalten: ReadonlyArray<DatenSpalte<T>>,
  sortierung: Sortierung | undefined,
): ReadonlyArray<T> {
  const spalte = spalten.find((s) => s.id === sortierung?.spalte)
  if (!sortierung || !spalte?.sortierwert) return zeilen
  const wert = spalte.sortierwert
  const faktor = sortierung.richtung === 'aufsteigend' ? 1 : -1
  return [...zeilen].sort((a, b) => faktor * vergleiche(wert(a), wert(b)))
}

function ariaSort(spalte: DatenSpalte<unknown>, sortierung: Sortierung | undefined) {
  if (sortierung?.spalte !== spalte.id) return undefined
  return sortierung.richtung === 'aufsteigend' ? ('ascending' as const) : ('descending' as const)
}

export function DatenTabelle<T>({
  beschriftung,
  zeilen,
  schluessel,
  spalten,
  sortierung,
  onSortierung,
  zeilenklick = false,
  kartenUnter,
  ansicht = 'automatisch',
  leer,
  className,
}: DatenTabelleProps<T>) {
  const grenze = kartenUnter ?? (spalten.length > 5 ? 'lg' : 'md')
  const schmal = useMedienabfrage(KARTEN_QUERY[grenze])
  const alsKarten = ansicht === 'automatisch' ? schmal : ansicht === 'karten'
  const { zeileGeklickt } = useZeilenklick()
  const sortierbar = onSortierung !== undefined
  const sichtbar = sortierbar ? sortiere(zeilen, spalten, sortierung) : zeilen

  if (zeilen.length === 0 && leer !== undefined) {
    return <p className={cn('text-muted-foreground', className)}>{leer}</p>
  }

  if (alsKarten) {
    const titelSpalte = spalten.find((s) => s.karte === 'titel')
    const felder = spalten.filter((s) => s.karte === 'feld')
    const aktionen = spalten.filter((s) => s.karte === 'aktion')
    return (
      <ul aria-label={beschriftung} className={cn('grid gap-3', className)}>
        {sichtbar.map((zeile) => (
          <li
            key={schluessel(zeile)}
            className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground shadow-xs"
          >
            {titelSpalte && (
              <h3 className="text-base font-semibold break-words">
                {(titelSpalte.kartenZelle ?? titelSpalte.zelle)(zeile)}
              </h3>
            )}
            {felder.length > 0 && (
              <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2">
                {felder.map((spalte) => (
                  <div key={spalte.id} className="col-span-2 grid grid-cols-subgrid">
                    <dt className="text-muted-foreground">{spalte.titel}</dt>
                    <dd className="min-w-0 break-words">{(spalte.kartenZelle ?? spalte.zelle)(zeile)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {aktionen.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {aktionen.map((spalte) => (
                  <div key={spalte.id} className="contents">
                    {(spalte.kartenZelle ?? spalte.zelle)(zeile)}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  function sortiereNach(spalte: DatenSpalte<T>) {
    if (!onSortierung) return
    const richtung: SortierRichtung =
      sortierung?.spalte === spalte.id && sortierung.richtung === 'aufsteigend' ? 'absteigend' : 'aufsteigend'
    onSortierung({ spalte: spalte.id, richtung })
  }

  return (
    <Table className={className}>
      <TableCaption className="sr-only">{beschriftung}</TableCaption>
      <TableHeader>
        <TableRow>
          {spalten.map((spalte) => {
            const zustand = ariaSort(spalte as DatenSpalte<unknown>, sortierung)
            const rechts = spalte.ausrichtung === 'rechts'
            return (
              <TableHead
                key={spalte.id}
                scope="col"
                aria-sort={zustand}
                className={cn(
                  BREITE[spalte.breite],
                  spalte.breite === 'schmal' ? 'whitespace-nowrap' : 'whitespace-normal',
                  rechts && 'text-right',
                )}
              >
                {sortierbar && spalte.sortierwert ? (
                  <button
                    type="button"
                    onClick={() => sortiereNach(spalte)}
                    className={cn(
                      '-mx-1 inline-flex min-h-10 flex-wrap items-center gap-x-0.5 rounded-md px-1 text-left font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
                      rechts && 'flex-row-reverse',
                    )}
                  >
                    {spalte.titel}
                    <span aria-hidden="true">
                      {zustand === 'ascending' ? (
                        <ArrowUpIcon className="size-4" />
                      ) : zustand === 'descending' ? (
                        <ArrowDownIcon className="size-4" />
                      ) : (
                        <ArrowUpDownIcon className="size-4 text-muted-foreground" />
                      )}
                    </span>
                  </button>
                ) : spalte.titelVersteckt ? (
                  <span className="sr-only">{spalte.titel}</span>
                ) : (
                  spalte.titel
                )}
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sichtbar.map((zeile) => (
          <TableRow
            key={schluessel(zeile)}
            className={zeilenklick ? 'cursor-pointer' : undefined}
            onClick={zeilenklick ? zeileGeklickt : undefined}
          >
            {spalten.map((spalte) => (
              <TableCell
                key={spalte.id}
                className={cn(BREITE[spalte.breite], spalte.ausrichtung === 'rechts' && 'text-right tabular-nums')}
              >
                {spalte.zelle(zeile)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
