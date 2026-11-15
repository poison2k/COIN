import { useRef, useState } from 'react'
import { useFormular } from '@/shared/lib/formular'
import { Aktionsleiste } from '@/shared/ui/aktionsleiste'
import { Bestaetigungsdialog } from '@/shared/ui/bestaetigungsdialog'
import { Blaettern } from '@/shared/ui/blaettern'
import { Button } from '@/shared/ui/button'
import { DatenTabelle, type DatenSpalte, type Sortierung } from '@/shared/ui/daten-tabelle'
import { Fehlerzusammenfassung } from '@/shared/ui/fehlerzusammenfassung'
import { Filterleiste } from '@/shared/ui/filterleiste'
import { FormularAbschnitt } from '@/shared/ui/formular-abschnitt'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
import { KennzahlKarte, KennzahlRaster } from '@/shared/ui/kennzahl-karte'
import { Label } from '@/shared/ui/label'
import { Progress } from '@/shared/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { VerlassenDialog } from '@/shared/ui/verlassen-warnung'
import { Zeitleiste } from '@/shared/ui/zeitleiste'
import { Abschnitt, Zeile } from './Abschnitt'

// Bausteine des Features formulare-detailseiten (Abschnitt 4.8, AK-35) auf der Bausteinseite: je Baustein ein Abschnitt
// mit Varianten und Zuständen, nur synthetische Daten, keine API-Aufrufe.

interface BeispielWerte {
  gelegenheit: string
  stelle: string
  begruendung: string
}

function pruefeBeispiel(werte: BeispielWerte): Partial<Record<keyof BeispielWerte, string>> {
  const fehler: Partial<Record<keyof BeispielWerte, string>> = {}
  if (werte.gelegenheit.trim() === '') fehler.gelegenheit = 'Gelegenheit ist erforderlich.'
  if (werte.stelle.trim() === '') fehler.stelle = 'Ausgebende Stelle oder Person ist erforderlich.'
  return fehler
}

const BEISPIEL_LABEL: Readonly<Record<keyof BeispielWerte, string>> = {
  gelegenheit: 'Gelegenheit',
  stelle: 'Ausgebende Stelle oder Person',
  begruendung: 'Begründung (optional)',
}

/** Beispielformular mit `useFormular` (Fehler beim Verlassen, Zusammenfassung ab zwei Fehlern). */
function BeispielFormular() {
  const [gespeichert, setGespeichert] = useState(false)
  const formular = useFormular<BeispielWerte>({
    ausgangswerte: { gelegenheit: '', stelle: '', begruendung: '' },
    pruefe: pruefeBeispiel,
    reihenfolge: ['gelegenheit', 'stelle', 'begruendung'],
    idPraefix: 'baustein-beispiel',
  })
  const gelegenheit = formular.feld('gelegenheit')
  const stelle = formular.feld('stelle')
  const begruendung = formular.feld('begruendung')
  return (
    <form
      className="grid max-w-reading gap-6"
      noValidate
      onSubmit={formular.absenden(() => {
        formular.zuruecksetzen()
        setGespeichert(true)
      })}
    >
      {formular.versucht && formular.fehlerListe.length >= 2 && (
        <Fehlerzusammenfassung
          fehler={formular.fehlerListe.map((f) => ({ feldId: f.feldId, label: BEISPIEL_LABEL[f.feld], text: f.text }))}
        />
      )}
      {gespeichert && <p role="status">Beispiel gespeichert (ohne Request).</p>}
      <FormularAbschnitt titel="Ausgabe" ebene={3} spalten={2} beschreibung="Zweispaltig ab 768 px.">
        <Formularfeld
          label="Gelegenheit"
          pflicht
          id={gelegenheit.id}
          fehler={gelegenheit.fehler}
          onBlur={gelegenheit.onBlur}
        >
          {(feld) => <Input {...feld} value={gelegenheit.value} onChange={gelegenheit.onChange} />}
        </Formularfeld>
        <Formularfeld
          label="Ausgebende Stelle oder Person"
          pflicht
          id={stelle.id}
          fehler={stelle.fehler}
          onBlur={stelle.onBlur}
        >
          {(feld) => <Input {...feld} value={stelle.value} onChange={stelle.onChange} />}
        </Formularfeld>
        <Formularfeld
          label={BEISPIEL_LABEL.begruendung}
          hilfetext="Höchstens 2.000 Zeichen."
          id={begruendung.id}
          fehler={begruendung.fehler}
          onBlur={begruendung.onBlur}
          className="md:col-span-2"
        >
          {(feld) => <Textarea {...feld} rows={3} value={begruendung.value} onChange={begruendung.onChange} />}
        </Formularfeld>
      </FormularAbschnitt>
      <Aktionsleiste fest={false}>
        <Button
          type="button"
          variant="outline"
          onClick={() => formular.zuruecksetzen({ gelegenheit: '', stelle: '', begruendung: '' })}
        >
          Abbrechen
        </Button>
        <Button type="submit">Speichern</Button>
      </Aktionsleiste>
    </form>
  )
}

interface Version {
  version: number
  datum: string
  groesse: number
  von: string
}

const VERSIONEN: Version[] = [
  { version: 3, datum: '11.10.2026, 11:00', groesse: 48_211, von: 'Test Sachbearbeiter' },
  { version: 2, datum: '09.10.2026, 09:30', groesse: 51_002, von: 'Test Administrator' },
  { version: 1, datum: '08.10.2026, 07:30', groesse: 1_234_567, von: 'Test Administrator' },
]

const VERSION_SPALTEN: ReadonlyArray<DatenSpalte<Version>> = [
  {
    id: 'version',
    titel: 'Version',
    breite: 'schmal',
    ausrichtung: 'rechts',
    karte: 'titel',
    zelle: (v) => v.version,
    kartenZelle: (v) => `Version ${v.version}`,
    sortierwert: (v) => v.version,
  },
  {
    id: 'datum',
    titel: 'Hochgeladen am',
    breite: 'mittel',
    karte: 'feld',
    zelle: (v) => v.datum,
    sortierwert: (v) => v.version,
  },
  { id: 'von', titel: 'Hochgeladen von', breite: 'breit', karte: 'feld', zelle: (v) => v.von },
  {
    id: 'groesse',
    titel: 'Größe',
    breite: 'schmal',
    ausrichtung: 'rechts',
    karte: 'feld',
    zelle: (v) => `${new Intl.NumberFormat('de-DE').format(Math.round(v.groesse / 1024))} KB`,
    sortierwert: (v) => v.groesse,
  },
  {
    id: 'aktion',
    titel: 'Aktionen',
    titelVersteckt: true,
    breite: 'schmal',
    ausrichtung: 'rechts',
    karte: 'aktion',
    zelle: (v) => (
      <Button type="button" variant="outline" size="sm" aria-label={`Version ${v.version} herunterladen`}>
        Herunterladen
      </Button>
    ),
  },
]

function DatentabelleBeispiel() {
  const [sortierung, setSortierung] = useState<Sortierung>({ spalte: 'version', richtung: 'absteigend' })
  const [karten, setKarten] = useState(false)
  return (
    <div className="grid gap-4">
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        aria-pressed={karten}
        onClick={() => setKarten((alt) => !alt)}
      >
        Kartenansicht zeigen
      </Button>
      <DatenTabelle
        beschriftung="Beispielversionen"
        zeilen={VERSIONEN}
        schluessel={(v) => String(v.version)}
        spalten={VERSION_SPALTEN}
        sortierung={sortierung}
        onSortierung={setSortierung}
        ansicht={karten ? 'karten' : 'automatisch'}
      />
      <DatenTabelle
        beschriftung="Leere Beispieltabelle"
        zeilen={[] as Version[]}
        schluessel={(v) => String(v.version)}
        spalten={VERSION_SPALTEN}
        leer="Es wurde noch keine eigene Vorlage hochgeladen."
      />
    </div>
  )
}

type StatusFilter = 'alle' | 'aktiv' | 'storniert'

const STATUS_FILTER = [
  { value: 'alle', label: 'Alle' },
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'storniert', label: 'Storniert' },
] satisfies Array<{ value: StatusFilter; label: string }>

function FilterleisteBeispiel() {
  const [status, setStatus] = useState<StatusFilter>('aktiv')
  const [suche, setSuche] = useState('Alpha')
  const chips = [
    ...(status !== 'alle'
      ? [
          {
            id: 'status',
            text: `Status: ${status === 'aktiv' ? 'Aktiv' : 'Storniert'}`,
            onEntfernen: () => setStatus('alle'),
          },
        ]
      : []),
    ...(suche !== '' ? [{ id: 'suche', text: `Suche: ${suche}`, onEntfernen: () => setSuche('') }] : []),
  ]
  return (
    <Filterleiste
      chips={chips}
      onAlleEntfernen={() => {
        setStatus('alle')
        setSuche('')
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="baustein-filter-status">Status</Label>
        <Select<StatusFilter> items={STATUS_FILTER} value={status} onValueChange={(wert) => setStatus(wert ?? 'alle')}>
          <SelectTrigger id="baustein-filter-status" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER.map((eintrag) => (
              <SelectItem key={eintrag.value} value={eintrag.value}>
                {eintrag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="baustein-filter-suche">Suche</Label>
        <Input
          id="baustein-filter-suche"
          type="search"
          className="w-56 max-w-full"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>
    </Filterleiste>
  )
}

function BestaetigungsdialogBeispiel() {
  const [offen, setOffen] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const ausloeser = useRef<HTMLButtonElement>(null)
  return (
    <Zeile>
      <Button ref={ausloeser} type="button" variant="destructive" onClick={() => setOffen(true)}>
        Beispiel stornieren
      </Button>
      <Button type="button" variant="outline" aria-pressed={laedt} onClick={() => setLaedt((alt) => !alt)}>
        Dialog im Zustand „lädt“
      </Button>
      <Bestaetigungsdialog
        offen={offen}
        onOffenAendern={setOffen}
        titel="Ausgabe stornieren?"
        folge="Die Ausgabe von Exemplar Nr. 12 bleibt in der Historie sichtbar. Das Exemplar ist danach wieder verfügbar."
        bestaetigen="Stornieren"
        variante="gefaehrlich"
        laedt={laedt}
        fehler={laedt ? undefined : 'Beispiel für eine Fehlermeldung im Dialog.'}
        onBestaetigen={() => setOffen(false)}
        ausloeserRef={ausloeser}
      />
    </Zeile>
  )
}

function VerlassenBeispiel() {
  const [offen, setOffen] = useState(false)
  return (
    <Zeile>
      <Button type="button" variant="outline" onClick={() => setOffen(true)}>
        Verlassen-Warnung zeigen
      </Button>
      <VerlassenDialog
        offen={offen}
        beschreibung="Der neue Coin ist nicht gespeichert. Seite trotzdem verlassen?"
        onBleiben={() => setOffen(false)}
        onVerlassen={() => setOffen(false)}
      />
    </Zeile>
  )
}

function BlaetternBeispiel() {
  const [seite, setSeite] = useState(1)
  return <Blaettern seite={seite} seiten={3} onSeite={setSeite} />
}

/** Abschnitte der neuen Bausteine in der Reihenfolge aus Abschnitt 4.8 (nach „Brotkrumen“). */
export function FormularBausteine() {
  return (
    <>
      <Abschnitt titel="Fortschrittsbalken" beschreibung="Base UI Progress; aria-valuetext nennt Anteil und Bezug.">
        <div className="grid max-w-reading gap-4">
          <Progress value={147} max={150} aria-label="Verfügbar" aria-valuetext="147 von 150 verfügbar (98 %)" />
          <Progress value={10} max={40} aria-label="Verfügbar (wenig)" aria-valuetext="10 von 40 verfügbar (25 %)" />
          <Progress value={0} max={100} aria-label="Verfügbar (keins)" aria-valuetext="0 von 100 verfügbar (0 %)" />
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Formularabschnitt"
        beschreibung="fieldset mit legend und Überschrift; Fehler erst beim Verlassen, Fokus auf den ersten Fehler."
      >
        <BeispielFormular />
      </Abschnitt>

      <Abschnitt titel="Fehlerzusammenfassung" beschreibung="Oben im Formular; die Links fokussieren das Feld.">
        <div className="grid max-w-reading gap-4">
          <Fehlerzusammenfassung
            fehler={[
              { feldId: 'baustein-zf-name', label: 'Name', text: 'Name ist erforderlich.' },
              { feldId: 'baustein-zf-herausgeber', label: 'Herausgeber', text: 'Herausgeber ist erforderlich.' },
            ]}
            weitere={['Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.']}
          />
          <Formularfeld label="Name" pflicht id="baustein-zf-name" fehler="Name ist erforderlich.">
            {(feld) => <Input {...feld} />}
          </Formularfeld>
          <Formularfeld label="Herausgeber" pflicht id="baustein-zf-herausgeber" fehler="Herausgeber ist erforderlich.">
            {(feld) => <Input {...feld} />}
          </Formularfeld>
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Aktionsleiste"
        beschreibung="Abbrechen links, Hauptaktion rechts; unter 768 px am unteren Rand."
      >
        <div className="grid max-w-reading gap-4">
          <Aktionsleiste fest={false}>
            <Button type="button" variant="outline">
              Abbrechen
            </Button>
            <Button type="button">Speichern</Button>
          </Aktionsleiste>
          <Aktionsleiste fest={false}>
            <Button type="button" variant="outline">
              Abbrechen
            </Button>
            <Button type="button" laedt>
              Speichern
            </Button>
          </Aktionsleiste>
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Bestätigungsdialog"
        beschreibung="Titel als Frage, Folge als Beschreibung, Anfangsfokus auf „Abbrechen“."
      >
        <BestaetigungsdialogBeispiel />
      </Abschnitt>

      <Abschnitt
        titel="Verlassen-Warnung"
        beschreibung="Bei ungespeicherten Änderungen; hier ohne Navigation geöffnet."
      >
        <VerlassenBeispiel />
      </Abschnitt>

      <Abschnitt
        titel="Kennzahlkarte"
        beschreibung="Beschreibungsliste; der Fortschrittsbalken steht außerhalb der Werte."
      >
        <KennzahlRaster>
          <KennzahlKarte begriff="Auflage" wert="150" />
          <KennzahlKarte begriff="Ausgegeben" wert="3" />
          <KennzahlKarte
            begriff="Verfügbar"
            wert="147"
            anteil={{ wert: 147, von: 150, text: '147 von 150 verfügbar (98 %)' }}
          />
        </KennzahlRaster>
      </Abschnitt>

      <Abschnitt titel="Zeitleiste" beschreibung="Geordnete Liste, älteste zuerst; Zeitpunkte als time-Element.">
        <Zeitleiste
          beschriftung="Beispielverlauf"
          eintraege={[
            {
              id: 'erfasst',
              titel: 'Ausgabe erfasst',
              zeitpunkt: '2026-10-08T09:00:00+00:00',
              zeitText: '08.10.2026, 11:00',
              beschreibung: 'von Test Sachbearbeiter',
              ton: 'erfolg',
            },
            {
              id: 'storniert',
              titel: 'Ausgabe storniert',
              zeitpunkt: '2026-10-09T08:00:00+00:00',
              zeitText: '09.10.2026, 10:00',
              beschreibung: 'von Test Administrator · Grund: Doppelt erfasst',
              ton: 'gefahr',
            },
          ]}
        />
      </Abschnitt>

      <Abschnitt
        titel="Datentabelle"
        beschreibung="Sortierbar per Button im Spaltenkopf; unter der Kartengrenze Karten statt Tabelle."
      >
        <DatentabelleBeispiel />
      </Abschnitt>

      <Abschnitt
        titel="Filterleiste"
        beschreibung="Aktive Filter als Chips; nach dem Entfernen bleibt der Fokus erhalten."
      >
        <FilterleisteBeispiel />
      </Abschnitt>

      <Abschnitt titel="Blättern" beschreibung="Vorherige Seite, Seite x von y, Nächste Seite.">
        <BlaetternBeispiel />
      </Abschnitt>
    </>
  )
}
