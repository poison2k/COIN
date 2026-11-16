import {
  InfotextBlock,
  KennzahlenBlock,
  Kopfbereich,
  MeistausgegebeneBlock,
  NeuesteCoinsBlock,
  type Block,
} from '@/entities/startseite'
import { cn } from '@/shared/lib/cn'
import { bildeZeilen } from '../model/bildeZeilen'

/** Überschrift ohne aktiven Kopfbereich (AK-21, S9). */
export const BEGRUESSUNG = 'Willkommen bei C.O.I.N.'

export interface StartseiteBloeckeProps {
  /** Aktive Blöcke in der Reihenfolge der API bzw. des Formulars. */
  bloecke: Block[]
  /** 1 auf `/` (Titel bzw. Begrüßung als h1, Blöcke h2), 2 in der Vorschau (h2/h3), AK-21 und AK-29. */
  ebene: 1 | 2
}

/**
 * Blöcke der Startseite in Zeilen ohne Lücken (startseite-listen-pruefung, Abschnitt 4.1, ADR-0043 Punkt 1). Ist der
 * Kopfbereich aktiv, ist sein Titel die oberste Überschrift, sonst „Willkommen bei C.O.I.N.“ als eigene Zeile. Je Zeile
 * ein Raster; nur Paarzeilen (Neueste + Meistausgegebene) haben ab `lg` zwei gleich breite Spalten.
 */
export function StartseiteBloecke({ bloecke, ebene }: StartseiteBloeckeProps) {
  const blockEbene = ebene === 1 ? 2 : 3
  const mitKopf = bloecke.some((b) => b.art === 'kopf')

  return (
    <div className="grid min-w-0 gap-6">
      {mitKopf ? null : <BegruessungsUeberschrift ebene={ebene} />}
      {bildeZeilen(bloecke).map((zeile) => (
        <div
          key={zeile.map((b) => b.art).join('-')}
          className={cn('grid min-w-0 items-stretch gap-6 *:min-w-0', zeile.length > 1 && 'lg:grid-cols-2')}
        >
          {zeile.map((block) => (
            <BlockInhalt key={block.art} block={block} ebene={ebene} blockEbene={blockEbene} />
          ))}
        </div>
      ))}
    </div>
  )
}

function BlockInhalt({ block, ebene, blockEbene }: { block: Block; ebene: 1 | 2; blockEbene: 2 | 3 }) {
  switch (block.art) {
    case 'kopf':
      return (
        <Kopfbereich
          titel={block.titel}
          untertitel={block.untertitel}
          logoBereitsteller={block.logoBereitsteller}
          logoSoftware={block.logoSoftware}
          ebene={ebene}
        />
      )
    case 'infotext':
      return <InfotextBlock text={block.text} />
    case 'kennzahlen':
      return <KennzahlenBlock kennzahlen={block} ebene={blockEbene} />
    case 'neueste':
      return <NeuesteCoinsBlock eintraege={block.eintraege} ebene={blockEbene} />
    case 'meistausgegeben':
      return <MeistausgegebeneBlock eintraege={block.eintraege} ebene={blockEbene} />
    default:
      return null
  }
}

function BegruessungsUeberschrift({ ebene }: { ebene: 1 | 2 }) {
  const Tag = ebene === 1 ? 'h1' : 'h2'
  return <Tag className="text-2xl font-semibold md:text-3xl">{BEGRUESSUNG}</Tag>
}
