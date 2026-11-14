import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ANZAHL_GRENZEN,
  BLOCK_NAMEN,
  LOGO_NAMEN,
  LOGO_PLAETZE,
  type BlockArt,
  type Konfiguration,
  type LogoPlatz,
} from '@/entities/startseite'
import { pruefeNachZeigerklick } from '@/shared/lib/formular'
import { formatiereZahl } from '@/shared/lib/format'
import { Aktionsleiste } from '@/shared/ui/aktionsleiste'
import { Bestaetigungsdialog } from '@/shared/ui/bestaetigungsdialog'
import { Button } from '@/shared/ui/button'
import { Fehlerzusammenfassung, type Feldbefund } from '@/shared/ui/fehlerzusammenfassung'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { speichereKonfiguration } from '../api/speichereKonfiguration'
import {
  alttextFeld,
  ausKonfiguration,
  LOGO_FELD,
  schalte,
  validiere,
  verschiebe,
  type Feldfehler,
  type Formular,
} from '../model/formular'
import { BlockKarte } from './BlockKarte'
import { LogoFeld } from './LogoFeld'

const TEXT_KONFLIKT = 'Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.'
const TEXT_GESPEICHERT = 'Die Startseite wurde gespeichert.'
const TEXT_NEU_GELADEN = 'Die Konfiguration wurde neu geladen.'

const HINWEIS_FORMAT =
  'PNG, JPEG oder WebP, höchstens 2 MB und 2048 × 2048 Pixel. SVG und animierte Bilder sind nicht erlaubt.'
const HINWEIS_METADATEN = 'Bitte nur Bilder ohne personenbezogene Metadaten hochladen.'
const HINWEIS_OEFFENTLICH = 'Kopfbereich und Logos sind auch ohne Anmeldung sichtbar.'
const HILFE_INFOTEXT =
  'Formatierung: **fett**, *kursiv*, Listen mit „- “ oder „1. “, Links als [Text](https://…). HTML wird nicht angezeigt. Bitte keine personenbezogenen Daten eintragen.'

/** Schlüssel, die die Oberfläche einem Feld zuordnet; andere Befunde erscheinen in der Zusammenfassung. */
const FELDER = new Set([
  'kopf.titel',
  'kopf.untertitel',
  'infotext.text',
  'neueste.anzahl',
  'meistausgegeben.anzahl',
  ...LOGO_PLAETZE.flatMap((p) => [LOGO_FELD[p], alttextFeld(p)]),
])

type Meldung =
  | { art: 'gespeichert' }
  | { art: 'neuGeladen' }
  | { art: 'pruefen'; weitere: string[] }
  | { art: 'konflikt' }
  | { art: 'fehler'; text: string }
  | { art: 'hinweis'; text: string }

type Fokus =
  | { art: 'feld' }
  | { art: 'meldung' }
  | { art: 'button'; block: BlockArt; richtung: -1 | 1 }
  | { art: 'zurueck'; element: HTMLElement }

export interface StartseiteFormularProps {
  /** Geladene bzw. zuletzt gespeicherte Konfiguration (Version für die Versionsprüfung, AK-13). */
  konfiguration: Konfiguration
  /** Ungespeicherter Formularzustand; liegt beim Aufrufer, damit die Vorschau ihn zeigen kann (AK-29). */
  formular: Formular
  /** Object-URLs der neu ausgewählten Logos (Vorschau im Feld). */
  logoUrls: Readonly<Record<LogoPlatz, string | null>>
  onAendern: (aendern: (alt: Formular) => Formular) => void
  /** Nach 200 mit der neuen Konfiguration (AK-31). */
  onGespeichert: (konfiguration: Konfiguration) => void
  /** „Neu laden“ nach 409 (AK-30). */
  onNeuLaden: () => void
  /** Von außen gesperrt (z. B. während „Neu laden“); wirkt wie die Sperre beim Speichern. */
  gesperrt?: boolean
  /** Das Formular wurde nach „Neu laden“ frisch eingehängt: Meldung „neu geladen“ mit Fokus (AK-30). */
  neuGeladen?: boolean
}

/**
 * Formular „Bearbeiten“ der Startseite (AK-27 bis AK-31): je Block eine Karte (Abschnitt) in aktueller Reihenfolge,
 * Client-Vorprüfung mit Feldfehlern beim Verlassen und Absenden und Zusammenfassung oben (schon ab einem Fehler,
 * formulare-detailseiten AK-7), Speichern als Ganzes, Serverfehler am Feld, „Änderungen verwerfen“ mit Rückfrage.
 * Eingaben und ausgewählte Dateien bleiben bei jedem Fehler erhalten.
 */
export function StartseiteFormular({
  konfiguration,
  formular,
  logoUrls,
  onAendern,
  onGespeichert,
  onNeuLaden,
  gesperrt: extern = false,
  neuGeladen = false,
}: StartseiteFormularProps) {
  const basis = useId()
  const [fehler, setFehler] = useState<Feldfehler>({})
  const [meldung, setMeldung] = useState<Meldung | null>(neuGeladen ? { art: 'neuGeladen' } : null)
  // Der Zähler erzeugt je Ansage einen neuen Textknoten, damit auch eine wiederholte Ansage vorgelesen wird.
  const [ansage, setAnsageZustand] = useState({ text: '', nr: 0 })
  const [sendetZustand, setSendet] = useState(false)
  const sendet = sendetZustand || extern
  const [verwerfenOffen, setVerwerfenOffen] = useState(false)
  const sendetRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const meldungRef = useRef<HTMLParagraphElement>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const fokus = useRef<Fokus | null>(neuGeladen ? { art: 'meldung' } : null)
  // Felder, die seit dem Laden geändert wurden: Nur sie werden beim Verlassen geprüft (ADR-0039).
  const geaenderteFelder = useRef(new Set<string>())
  // Aktueller Formularzustand für die verzögerte Prüfung nach einem Zeigerklick.
  const formularRef = useRef(formular)
  useEffect(() => {
    formularRef.current = formular
  })

  const titelId = `${basis}-titel`
  const untertitelId = `${basis}-untertitel`
  const infotextId = `${basis}-infotext`
  const logoId = (platz: LogoPlatz) => `${basis}-logo-${platz}`

  /** Feld-Id und Beschriftung je Fehlerschlüssel (für die Zusammenfassung), in Formularreihenfolge. */
  function feldbefunde(): Feldbefund[] {
    const befunde: Feldbefund[] = []
    const dazu = (schluessel: string, feldId: string, label: string) => {
      const text = fehler[schluessel]
      if (text) befunde.push({ feldId, label, text })
    }
    for (const art of formular.reihenfolge) {
      if (art === 'kopf') {
        dazu('kopf.titel', titelId, 'Titel')
        dazu('kopf.untertitel', untertitelId, 'Untertitel')
        for (const platz of LOGO_PLAETZE) {
          dazu(LOGO_FELD[platz], `${logoId(platz)}-datei`, `${LOGO_NAMEN[platz]}: Logo auswählen`)
          dazu(alttextFeld(platz), `${logoId(platz)}-alt`, `${LOGO_NAMEN[platz]}: Alternativtext`)
        }
      } else if (art === 'infotext') {
        dazu('infotext.text', infotextId, 'Infotext')
      } else if (art === 'neueste' || art === 'meistausgegeben') {
        dazu(`${art}.anzahl`, `${basis}-${art}-anzahl`, `${BLOCK_NAMEN[art]}: Anzahl`)
      }
    }
    return befunde
  }

  /** Eingabe: Feld als geändert merken; ein angezeigter Fehler verschwindet, sobald er nicht mehr zutrifft. */
  function aendereFeld(schluessel: string, aendern: (alt: Formular) => Formular) {
    geaenderteFelder.current.add(schluessel)
    onAendern(aendern)
    if (fehler[schluessel] === undefined) return
    const neu = validiere(aendern(formular))[schluessel]
    if (neu !== fehler[schluessel]) {
      setFehler((alt) => {
        const kopie = { ...alt }
        delete kopie[schluessel]
        return kopie
      })
    }
  }

  /** Verlassen: geänderte Felder prüfen (bestehende Regeln aus `validiere`). */
  function verlasse(schluessel: string) {
    if (!geaenderteFelder.current.has(schluessel)) return
    pruefeNachZeigerklick(() => {
      const meldung = validiere(formularRef.current)[schluessel]
      setFehler((alt) => {
        if (alt[schluessel] === meldung) return alt
        const kopie = { ...alt }
        if (meldung) kopie[schluessel] = meldung
        else delete kopie[schluessel]
        return kopie
      })
    })
  }

  function setAnsage(text: string) {
    setAnsageZustand((alt) => ({ text, nr: alt.nr + 1 }))
  }

  // Fokus nach dem Rendern setzen: erstes ungültiges Feld, Erfolgsmeldung oder derselbe Verschieben-Button (AK-28/30/31).
  useEffect(() => {
    const ziel = fokus.current
    if (!ziel) return
    fokus.current = null
    if (ziel.art === 'feld') {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    } else if (ziel.art === 'meldung') {
      meldungRef.current?.focus()
    } else if (ziel.art === 'zurueck') {
      // Gesperrte Felder verlieren den Fokus; nach dem Speichern dorthin zurück, sofern er nicht woanders liegt.
      const aktiv = document.activeElement
      if ((!aktiv || aktiv === document.body) && ziel.element.isConnected) ziel.element.focus()
    } else {
      buttons.current.get(`${ziel.block}:${ziel.richtung}`)?.focus()
    }
  })

  const anzahlBloecke = formular.reihenfolge.length

  function verschiebeBlock(art: BlockArt, richtung: -1 | 1) {
    const position = formular.reihenfolge.indexOf(art) + 1 + richtung
    onAendern((alt) => verschiebe(alt, art, richtung))
    setAnsage(`${BLOCK_NAMEN[art]} steht jetzt an Position ${position} von ${anzahlBloecke}.`)
    fokus.current = { art: 'button', block: art, richtung }
  }

  function zeigeFehler(neu: Feldfehler) {
    const feldFehler: Feldfehler = {}
    const weitere: string[] = []
    for (const [feld, text] of Object.entries(neu)) {
      if (FELDER.has(feld)) feldFehler[feld] = text
      else weitere.push(text)
    }
    setFehler(feldFehler)
    setMeldung({ art: 'pruefen', weitere })
    fokus.current = Object.keys(feldFehler).length > 0 ? { art: 'feld' } : null
  }

  async function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetRef.current || extern) return
    const clientFehler = validiere(formular)
    if (Object.keys(clientFehler).length > 0) {
      zeigeFehler(clientFehler)
      return
    }

    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sendetRef.current = true
    setSendet(true)
    setFehler({})
    setMeldung(null)
    try {
      const ergebnis = await speichereKonfiguration(formular, konfiguration.version)
      switch (ergebnis.art) {
        case 'gespeichert':
          geaenderteFelder.current.clear()
          onGespeichert(ergebnis.konfiguration)
          setMeldung({ art: 'gespeichert' })
          fokus.current = { art: 'meldung' }
          return
        case 'feldfehler':
          if (ergebnis.zusammenfassung) setMeldung({ art: 'fehler', text: ergebnis.zusammenfassung })
          else zeigeFehler(ergebnis.fehler)
          return
        case 'konflikt':
          setMeldung({ art: 'konflikt' })
          return
        case 'meldung':
          setMeldung({ art: ergebnis.hinweis ? 'hinweis' : 'fehler', text: ergebnis.text })
          return
      }
    } finally {
      sendetRef.current = false
      setSendet(false)
      if (!fokus.current && vorher && vorher !== document.body) fokus.current = { art: 'zurueck', element: vorher }
    }
  }

  function verwerfen() {
    geaenderteFelder.current.clear()
    onAendern(() => ausKonfiguration(konfiguration))
    setFehler({})
    setMeldung(null)
    setVerwerfenOffen(false)
  }

  function feld(id: string, schluessel: string, beschreibung?: string) {
    const fehlerId = `${id}-fehler`
    const beschrieben = [beschreibung, fehler[schluessel] ? fehlerId : undefined].filter(Boolean).join(' ')
    return {
      attribute: {
        id,
        'aria-invalid': fehler[schluessel] ? true : undefined,
        'aria-describedby': beschrieben || undefined,
      },
      meldung: fehler[schluessel] ? (
        <p id={fehlerId} className="text-sm text-destructive">
          {fehler[schluessel]}
        </p>
      ) : null,
    }
  }

  function felderVon(art: BlockArt): ReactNode {
    switch (art) {
      case 'kopf':
        return kopfFelder()
      case 'infotext':
        return infotextFelder()
      case 'neueste':
      case 'meistausgegeben':
        return anzahlFeld(art)
      default:
        return null
    }
  }

  function kopfFelder() {
    const hinweisIds = `${basis}-hinweis-format ${basis}-hinweis-metadaten ${basis}-hinweis-oeffentlich`
    return (
      <>
        <div className="grid gap-4 md:grid-cols-2">
          <Formularfeld
            label="Titel"
            pflicht={formular.aktiv.kopf}
            id={titelId}
            fehler={fehler['kopf.titel']}
            onBlur={() => verlasse('kopf.titel')}
          >
            {(attribute) => (
              <Input
                {...attribute}
                type="text"
                value={formular.titel}
                onChange={(e) => {
                  const wert = e.target.value
                  aendereFeld('kopf.titel', (alt) => ({ ...alt, titel: wert }))
                }}
                disabled={sendet}
              />
            )}
          </Formularfeld>
          <Formularfeld
            label="Untertitel"
            id={untertitelId}
            fehler={fehler['kopf.untertitel']}
            onBlur={() => verlasse('kopf.untertitel')}
          >
            {(attribute) => (
              <Input
                {...attribute}
                type="text"
                value={formular.untertitel}
                onChange={(e) => {
                  const wert = e.target.value
                  aendereFeld('kopf.untertitel', (alt) => ({ ...alt, untertitel: wert }))
                }}
                disabled={sendet}
              />
            )}
          </Formularfeld>
        </div>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p id={`${basis}-hinweis-format`}>{HINWEIS_FORMAT}</p>
          <p id={`${basis}-hinweis-metadaten`}>{HINWEIS_METADATEN}</p>
          <p id={`${basis}-hinweis-oeffentlich`}>{HINWEIS_OEFFENTLICH}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {LOGO_PLAETZE.map((platz) => (
            <LogoFeld
              key={platz}
              platz={platz}
              idBasis={logoId(platz)}
              eingabe={formular.logos[platz]}
              vorschauUrl={logoUrls[platz]}
              hinweisIds={hinweisIds}
              dateiFehler={fehler[LOGO_FELD[platz]]}
              alttextFehler={fehler[alttextFeld(platz)]}
              gesperrt={sendet}
              onDatei={(datei) =>
                onAendern((alt) => ({ ...alt, logos: { ...alt.logos, [platz]: { ...alt.logos[platz], datei } } }))
              }
              onEntfernen={() => {
                onAendern((alt) => ({
                  ...alt,
                  logos: { ...alt.logos, [platz]: { ...alt.logos[platz], datei: null, vorhanden: null } },
                }))
                setAnsage(`${LOGO_NAMEN[platz]} entfernt.`)
              }}
              onAlternativtext={(text) =>
                onAendern((alt) => ({
                  ...alt,
                  logos: { ...alt.logos, [platz]: { ...alt.logos[platz], alternativtext: text } },
                }))
              }
            />
          ))}
        </div>
      </>
    )
  }

  function infotextFelder() {
    return (
      <Formularfeld
        label="Infotext"
        pflicht={formular.aktiv.infotext}
        hilfetext={HILFE_INFOTEXT}
        id={infotextId}
        fehler={fehler['infotext.text']}
        onBlur={() => verlasse('infotext.text')}
      >
        {(attribute) => (
          <>
            <Textarea
              {...attribute}
              rows={6}
              value={formular.infotext}
              onChange={(e) => {
                const wert = e.target.value
                aendereFeld('infotext.text', (alt) => ({ ...alt, infotext: wert }))
              }}
              disabled={sendet}
            />
            <p className="text-sm text-muted-foreground">{`${formatiereZahl(formular.infotext.length)} von 5.000 Zeichen`}</p>
          </>
        )}
      </Formularfeld>
    )
  }

  function anzahlFeld(art: 'neueste' | 'meistausgegeben') {
    const { min, max } = ANZAHL_GRENZEN[art]
    const eintraege = Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, label: String(min + i) }))
    const anzahl = feld(`${basis}-${art}-anzahl`, `${art}.anzahl`)
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={anzahl.attribute.id}>Anzahl</Label>
        <Select<number>
          items={eintraege}
          value={formular.anzahl[art]}
          disabled={sendet}
          onValueChange={(wert) => {
            if (wert !== null) onAendern((alt) => ({ ...alt, anzahl: { ...alt.anzahl, [art]: wert } }))
          }}
        >
          <SelectTrigger className="min-w-24" {...anzahl.attribute}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {eintraege.map((eintrag) => (
              <SelectItem key={eintrag.value} value={eintrag.value}>
                {eintrag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {anzahl.meldung}
      </div>
    )
  }

  const befunde = meldung?.art === 'pruefen' ? feldbefunde() : []
  const zusammenfassung = meldung?.art === 'pruefen' && (befunde.length > 0 || meldung.weitere.length > 0)

  return (
    <form ref={formRef} className="grid gap-4" onSubmit={(e) => void absenden(e)} noValidate>
      <p role="status" className="sr-only">
        {ansage.text ? <span key={ansage.nr}>{ansage.text}</span> : null}
      </p>
      {zusammenfassung && meldung?.art === 'pruefen' && (
        <Fehlerzusammenfassung fehler={befunde} weitere={meldung.weitere} />
      )}
      <MeldungAnzeige meldung={meldung} meldungRef={meldungRef} onNeuLaden={onNeuLaden} gesperrt={sendet} />

      {formular.reihenfolge.map((art, index) => (
        <BlockKarte
          key={art}
          art={art}
          aktiv={formular.aktiv[art]}
          position={index + 1}
          anzahlBloecke={anzahlBloecke}
          gesperrt={sendet}
          onSchalten={(an) => onAendern((alt) => schalte(alt, art, an))}
          onVerschieben={(richtung) => verschiebeBlock(art, richtung)}
          buttonRef={(richtung, element) => {
            const schluessel = `${art}:${richtung}`
            if (element) buttons.current.set(schluessel, element)
            else buttons.current.delete(schluessel)
          }}
        >
          {felderVon(art)}
        </BlockKarte>
      ))}

      <Aktionsleiste>
        <Button
          type="button"
          variant="outline"
          onClick={() => setVerwerfenOffen(true)}
          disabled={sendet}
          focusableWhenDisabled
        >
          Änderungen verwerfen
        </Button>
        <Button type="submit" laedt={sendet}>
          Speichern
        </Button>
      </Aktionsleiste>

      <Bestaetigungsdialog
        offen={verwerfenOffen}
        onOffenAendern={setVerwerfenOffen}
        titel="Änderungen verwerfen?"
        folge="Alle ungespeicherten Änderungen an der Startseite gehen verloren."
        bestaetigen="Verwerfen"
        variante="gefaehrlich"
        onBestaetigen={verwerfen}
      />
    </form>
  )
}

function MeldungAnzeige({
  meldung,
  meldungRef,
  onNeuLaden,
  gesperrt,
}: {
  meldung: Meldung | null
  meldungRef: React.RefObject<HTMLParagraphElement | null>
  onNeuLaden: () => void
  gesperrt: boolean
}) {
  if (!meldung) return null
  switch (meldung.art) {
    case 'gespeichert':
    case 'neuGeladen':
      return (
        <p ref={meldungRef} role="status" tabIndex={-1} className="font-medium text-foreground outline-none">
          {meldung.art === 'gespeichert' ? TEXT_GESPEICHERT : TEXT_NEU_GELADEN}
        </p>
      )
    case 'pruefen':
      // Die Zusammenfassung rendert das Formular selbst (Fehlerzusammenfassung oben).
      return null
    case 'konflikt':
      return (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-destructive">
          <p className="font-medium">{TEXT_KONFLIKT}</p>
          <Button type="button" variant="outline" onClick={onNeuLaden} disabled={gesperrt} focusableWhenDisabled>
            Neu laden
          </Button>
        </div>
      )
    case 'hinweis':
      return (
        <p role="status" className="text-muted-foreground">
          {meldung.text}
        </p>
      )
    case 'fehler':
      return (
        <p role="alert" className="text-destructive">
          {meldung.text}
        </p>
      )
  }
}
