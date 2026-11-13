import {
  InfotextBlock,
  KennzahlenBlock,
  Kopfbereich,
  MeistausgegebeneBlock,
  NeuesteCoinsBlock,
  type Block,
} from '@/entities/startseite'

/** Überschrift ohne aktiven Kopfbereich (AK-21, S9). */
export const BEGRUESSUNG = 'Willkommen bei C.O.I.N.'

export interface StartseiteBloeckeProps {
  /** Aktive Blöcke in der Reihenfolge der API bzw. des Formulars. */
  bloecke: Block[]
  /** 1 auf `/` (Titel bzw. Begrüßung als h1, Blöcke h2), 2 in der Vorschau (h2/h3), AK-21 und AK-29. */
  ebene: 1 | 2
}

/**
 * Blöcke der Startseite in Reihenfolge (AK-20, AK-21). Ist der Kopfbereich aktiv, ist sein Titel die oberste
 * Überschrift, sonst „Willkommen bei C.O.I.N.“. Kennzahlen und Listen stehen ab `lg` nebeneinander (zwischen `md` und `lg` einspaltig, sonst horizontales Scrollen neben der Seitenleiste).
 */
export function StartseiteBloecke({ bloecke, ebene }: StartseiteBloeckeProps) {
  const blockEbene = ebene === 1 ? 2 : 3
  const mitKopf = bloecke.some((b) => b.art === 'kopf')

  return (
    <div className="grid gap-6 *:min-w-0 lg:grid-cols-3">
      {mitKopf ? null : <BegruessungsUeberschrift ebene={ebene} />}
      {bloecke.map((block, index) => {
        switch (block.art) {
          case 'kopf':
            return (
              <div key={`kopf-${index}`} className="lg:col-span-3">
                <Kopfbereich
                  titel={block.titel}
                  untertitel={block.untertitel}
                  logoBereitsteller={block.logoBereitsteller}
                  logoSoftware={block.logoSoftware}
                  ebene={ebene}
                />
              </div>
            )
          case 'infotext':
            return (
              <div key={`infotext-${index}`} className="lg:col-span-3">
                <InfotextBlock text={block.text} />
              </div>
            )
          case 'kennzahlen':
            return <KennzahlenBlock key={`kennzahlen-${index}`} kennzahlen={block} ebene={blockEbene} />
          case 'neueste':
            return <NeuesteCoinsBlock key={`neueste-${index}`} eintraege={block.eintraege} ebene={blockEbene} />
          case 'meistausgegeben':
            return (
              <MeistausgegebeneBlock key={`meistausgegeben-${index}`} eintraege={block.eintraege} ebene={blockEbene} />
            )
          default:
            return null
        }
      })}
    </div>
  )
}

function BegruessungsUeberschrift({ ebene }: { ebene: 1 | 2 }) {
  const Tag = ebene === 1 ? 'h1' : 'h2'
  return <Tag className="text-2xl font-semibold lg:col-span-3">{BEGRUESSUNG}</Tag>
}
