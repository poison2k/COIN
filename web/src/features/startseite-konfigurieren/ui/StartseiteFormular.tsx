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
import { formatiereZahl } from '@/shared/lib/format'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
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

const TEXT_PRUEFEN = 'Bitte die markierten Eingaben prüfen.'
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
 * Formular „Bearbeiten“ der Startseite (AK-27 bis AK-31): je Block eine Karte in aktueller Reihenfolge, Client-
 * Vorprüfung mit Feldfehlern und Zusammenfassung, Speichern als Ganzes, Serverfehler am Feld, „Änderungen verwerfen“
 * mit Rückfrage. Eingaben und ausgewählte Dateien bleiben bei jedem Fehler erhalten.
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
    const titel = feld(`${basis}-titel`, 'kopf.titel')
    const untertitel = feld(`${basis}-untertitel`, 'kopf.untertitel')
    const hinweisIds = `${basis}-hinweis-format ${basis}-hinweis-metadaten ${basis}-hinweis-oeffentlich`
    return (
      <>
        <div className="grid gap-1.5">
          <Label htmlFor={titel.attribute.id}>Titel</Label>
          <Input
            type="text"
            value={formular.titel}
            onChange={(e) => {
              const wert = e.target.value
              onAendern((alt) => ({ ...alt, titel: wert }))
            }}
            disabled={sendet}
            {...titel.attribute}
          />
          {titel.meldung}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={untertitel.attribute.id}>Untertitel</Label>
          <Input
            type="text"
            value={formular.untertitel}
            onChange={(e) => {
              const wert = e.target.value
              onAendern((alt) => ({ ...alt, untertitel: wert }))
            }}
            disabled={sendet}
            {...untertitel.attribute}
          />
          {untertitel.meldung}
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
    const hilfeId = `${basis}-infotext-hilfe`
    const infotext = feld(`${basis}-infotext`, 'infotext.text', hilfeId)
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={infotext.attribute.id}>Infotext</Label>
        <Textarea
          rows={6}
          value={formular.infotext}
          onChange={(e) => {
            const wert = e.target.value
            onAendern((alt) => ({ ...alt, infotext: wert }))
          }}
          disabled={sendet}
          {...infotext.attribute}
        />
        <p className="text-sm text-muted-foreground">{`${formatiereZahl(formular.infotext.length)} von 5.000 Zeichen`}</p>
        <p id={hilfeId} className="text-sm text-muted-foreground">
          {HILFE_INFOTEXT}
        </p>
        {infotext.meldung}
      </div>
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

  return (
    <form ref={formRef} className="grid gap-4" onSubmit={(e) => void absenden(e)} noValidate>
      <p role="status" className="sr-only">
        {ansage.text ? <span key={ansage.nr}>{ansage.text}</span> : null}
      </p>
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

      <MeldungAnzeige meldung={meldung} meldungRef={meldungRef} onNeuLaden={onNeuLaden} gesperrt={sendet} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={sendet} focusableWhenDisabled>
          Speichern
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setVerwerfenOffen(true)}
          disabled={sendet}
          focusableWhenDisabled
        >
          Änderungen verwerfen
        </Button>
      </div>

      <AlertDialog open={verwerfenOffen} onOpenChange={setVerwerfenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderungen verwerfen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle ungespeicherten Änderungen an der Startseite gehen verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={verwerfen}>
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      return (
        <div role="alert" className="grid gap-1 text-destructive">
          <p className="font-medium">{TEXT_PRUEFEN}</p>
          {meldung.weitere.length > 0 ? (
            <ul className="list-disc pl-6 text-sm">
              {meldung.weitere.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )
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
